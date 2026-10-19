use super::*;
use crate::market_data::transport::{
    HttpTransport, MarketDataRequest, TransportFailure, TransportResponse,
};
use std::ffi::OsString;

fn parse(args: &[&str]) -> Option<ServerMode> {
    ServerMode::from_arguments(&args.iter().map(OsString::from).collect::<Vec<_>>())
}

#[test]
fn development_startup_is_a_closed_suffix_policy() {
    assert_eq!(parse(&["--serve", "--dev-ui"]), Some(ServerMode::DevUi));
    for (name, scenario) in [
        ("success", FixtureScenario::Success),
        ("partial", FixtureScenario::Partial),
        ("stale", FixtureScenario::Stale),
        ("timeout", FixtureScenario::Timeout),
        ("rate-limit", FixtureScenario::RateLimit),
        ("unavailable", FixtureScenario::Unavailable),
    ] {
        assert_eq!(
            parse(&["--serve", "--fixture", name, "--dev-ui"]),
            Some(ServerMode::DevUiFixture(scenario))
        );
    }
    for args in [
        vec!["--dev-ui"],
        vec!["--dev-ui", "--serve"],
        vec!["--serve", "--dev-ui", "--fixture", "success"],
        vec!["--serve", "--dev-ui", "--dev-ui"],
        vec!["--serve", "--dev-ui", "5174"],
        vec!["--serve", "--dev-ui=http://127.0.0.1:5173"],
        vec!["--serve", "--fixture", "unknown", "--dev-ui"],
        vec!["--serve", "--fixture", "success", "--dev-ui", "extra"],
    ] {
        assert_eq!(parse(&args), None, "{args:?}");
    }
}

async fn configured(mode: ServerMode) -> Harness {
    Harness::configured(false, false, |app| {
        *app = App::for_mode(app.authority.clone(), app.clock.clone(), mode);
    })
    .await
}
fn with_origin(s: &Harness, method: &str, path: &str, body: &str, origin: Option<&str>) -> String {
    let mut request = s
        .request(method, path, body)
        .replace(&format!("Origin: http://{}\r\n", s.address), "");
    if let Some(origin) = origin {
        request = request.replacen(
            "Content-Type:",
            &format!("Origin: {origin}\r\nContent-Type:"),
            1,
        );
    }
    request
}

#[tokio::test(flavor = "current_thread")]
async fn production_and_development_origins_are_mutually_exclusive() {
    for mode in [ServerMode::Real, ServerMode::DevUi] {
        let s = configured(mode).await;
        let production = format!("http://{}", s.address);
        let allowed = if mode == ServerMode::DevUi {
            "http://127.0.0.1:5173"
        } else {
            &production
        };
        let rejected = if mode == ServerMode::DevUi {
            &production
        } else {
            "http://127.0.0.1:5173"
        };
        for method in ["GET", "POST"] {
            let path = if method == "GET" {
                "/api/v1/dashboard"
            } else {
                "/api/v1/valuation"
            };
            let body = if method == "GET" {
                String::new()
            } else {
                s.valuation("0", "0")
            };
            assert_eq!(
                decode(
                    &s.exchange(&with_origin(&s, method, path, &body, Some(allowed)))
                        .await
                )
                .0,
                200
            );
            assert_eq!(
                decode(
                    &s.exchange(&with_origin(&s, method, path, &body, Some(rejected)))
                        .await
                )
                .0,
                403
            );
        }
        assert_eq!(
            decode(
                &s.exchange(&with_origin(&s, "GET", "/api/v1/dashboard", "", None))
                    .await
            )
            .0,
            200
        );
        assert_eq!(
            decode(
                &s.exchange(&with_origin(
                    &s,
                    "POST",
                    "/api/v1/valuation",
                    &s.valuation("0", "0"),
                    None
                ))
                .await
            )
            .0,
            403
        );
        s.stop().await;
    }
}

#[tokio::test(flavor = "current_thread")]
async fn invalid_development_origins_never_reach_refresh_admission() {
    let s = configured(ServerMode::DevUiFixture(FixtureScenario::Success)).await;
    let before = s.app.dashboard();
    for origin in [
        "",
        "null",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "https://127.0.0.1:5173",
        "http://127.0.0.1:5173/",
        "http://127.0.0.1:5173.evil.invalid",
        "http://127.0.0.1:5173, http://127.0.0.1:5173",
        "http://127.0.0.1:5173\r\nOrigin: http://127.0.0.1:5173",
    ] {
        let request = with_origin(&s, "POST", "/api/v1/refresh", "{}", Some(origin));
        let (status, value) = decode(&s.exchange(&request).await);
        assert_eq!(status, 403, "{origin:?}");
        assert_eq!(value["error"]["code"], "invalid_origin");
        assert_eq!(s.app.dashboard(), before);
    }
    let request = with_origin(&s, "POST", "/api/v1/refresh", "{}", None).replace(
        "Content-Type:",
        "X-Forwarded-Host: 127.0.0.1:5173\r\nForwarded: host=127.0.0.1:5173\r\nContent-Type:",
    );
    assert_eq!(decode(&s.exchange(&request).await).0, 403);
    assert_eq!(s.app.dashboard(), before);
    s.stop().await;
}

#[tokio::test(flavor = "current_thread")]
async fn dev_origin_does_not_relax_host_content_or_body_limits() {
    let s = configured(ServerMode::DevUi).await;
    let request = with_origin(
        &s,
        "POST",
        "/api/v1/valuation",
        &s.valuation("0", "0"),
        Some("http://127.0.0.1:5173"),
    );
    assert_eq!(
        decode(
            &s.exchange(&request.replace(&format!("Host: {}", s.address), "Host: 127.0.0.1:5173"))
                .await
        )
        .0,
        403
    );
    assert_eq!(
        decode(
            &s.exchange(&request.replace("application/json", "text/plain"))
                .await
        )
        .0,
        415
    );
    let oversized = with_origin(
        &s,
        "POST",
        "/api/v1/valuation",
        &" ".repeat(4097),
        Some("http://127.0.0.1:5173"),
    );
    assert_eq!(decode(&s.exchange(&oversized).await).0, 413);
    assert_eq!(s.app.connections.available_permits(), 32);
    assert_eq!(s.app.handlers.available_permits(), 8);
    s.stop().await;
}

struct ForbiddenNetwork;
impl HttpTransport for ForbiddenNetwork {
    fn execute(&mut self, _: &MarketDataRequest) -> Result<TransportResponse, TransportFailure> {
        panic!("development fixture must never execute production transport")
    }
}
#[tokio::test(flavor = "current_thread")]
async fn development_fixture_worker_excludes_production_factory_and_preserves_notice() {
    let s = configured(ServerMode::DevUiFixture(FixtureScenario::Success)).await;
    let (worker, ready) = start_worker(
        s.app.clone(),
        || -> Result<ForbiddenNetwork, MarketDataError> {
            panic!("development fixture constructed production transport")
        },
    )
    .unwrap();
    ready.await.unwrap().unwrap();
    let initial = s.app.annotate(s.app.dashboard());
    assert_eq!(initial["mode"], "fixture");
    assert_eq!(initial["fixture"]["scenario"], "success");
    assert!(
        initial["fixture"]["notice"]
            .as_str()
            .unwrap()
            .contains("Synthetic")
    );
    assert!(initial["markets"][0]["observation"].is_null());
    let request = with_origin(
        &s,
        "POST",
        "/api/v1/refresh",
        "{}",
        Some("http://127.0.0.1:5173"),
    );
    let (status, value) = decode(&s.exchange(&request).await);
    assert_eq!(status, 200);
    assert_eq!(value["markets"][0]["observation"]["price"], "65000.12");
    assert_eq!(value["markets"][0]["observation"]["provenance"], "fixture");
    s.stop().await;
    worker.join().unwrap();
}
