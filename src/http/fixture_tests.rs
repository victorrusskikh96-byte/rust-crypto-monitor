use super::*;
use crate::http::{FixtureScenario, ServerMode};
use crate::market_data::transport::{
    HttpTransport, MarketDataRequest, TransportFailure, TransportResponse,
};
use std::ffi::OsString;

struct NoNetwork;
impl HttpTransport for NoNetwork {
    fn execute(&mut self, _: &MarketDataRequest) -> Result<TransportResponse, TransportFailure> {
        panic!("upstream transport must never execute");
    }
}
fn mode(arguments: &[&str]) -> Option<ServerMode> {
    ServerMode::from_arguments(&arguments.iter().map(OsString::from).collect::<Vec<_>>())
}
#[test]
fn explicit_startup_accepts_only_exact_real_and_fixture_forms() {
    assert_eq!(mode(&["--serve"]), Some(ServerMode::Real));
    for (name, scenario) in [
        ("success", FixtureScenario::Success),
        ("partial", FixtureScenario::Partial),
        ("stale", FixtureScenario::Stale),
        ("timeout", FixtureScenario::Timeout),
        ("rate-limit", FixtureScenario::RateLimit),
        ("unavailable", FixtureScenario::Unavailable),
    ] {
        assert_eq!(
            mode(&["--serve", "--fixture", name]),
            Some(ServerMode::Fixture(scenario))
        );
    }
    assert_eq!(mode(&["BTC/USDT"]), None);
    assert_eq!(mode(&["ETH/USDT"]), None);
}
#[test]
fn malformed_startup_never_selects_a_server_or_fallback() {
    for args in [
        vec![],
        vec!["--fixture", "success"],
        vec!["--serve", "--fixture"],
        vec!["--serve", "--fixture", ""],
        vec!["--serve", "--fixture", "Success"],
        vec!["--serve", "--fixture", " success"],
        vec!["--serve", "--fixture", "success "],
        vec!["--serve", "--fixture", "../success"],
        vec!["--serve", "--fixture", "https://example.invalid"],
        vec!["--serve", "--fixture", "unknown"],
        vec!["--serve", "--fixture=success"],
        vec!["--fixture", "success", "--serve"],
        vec!["--serve", "--serve"],
        vec!["--serve", "--fixture", "success", "extra"],
        vec!["--serve", "--fixture", "success", "--fixture", "timeout"],
    ] {
        assert_eq!(mode(&args), None, "{args:?}");
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStringExt;
        assert_eq!(
            ServerMode::from_arguments(&[
                "--serve".into(),
                "--fixture".into(),
                OsString::from_wide(&[0xd800])
            ]),
            None
        );
    }
}
async fn fixture(scenario: FixtureScenario) -> (Harness, Worker) {
    let s = Harness::configured(false, false, |app| {
        *app = App::for_mode(
            app.authority.clone(),
            app.clock.clone(),
            ServerMode::Fixture(scenario),
        );
    })
    .await;
    // This is the production construction boundary used by run_mode().
    let (worker, ready) = start_worker(s.app.clone(), || -> Result<NoNetwork, MarketDataError> {
        panic!("fixture mode called production factory");
    })
    .unwrap();
    ready.await.unwrap().unwrap();
    (s, worker)
}
async fn refresh(s: &Harness) -> Value {
    let (status, value) = s.api("POST", "/api/v1/refresh", "{}").await;
    assert_eq!(status, 200, "{value}");
    assert_eq!(value["mode"], "fixture");
    assert_eq!(value["provenance"], "fixture");
    assert!(
        value["fixture"]["notice"]
            .as_str()
            .unwrap()
            .contains("Synthetic")
    );
    value
}
async fn value(s: &Harness, btc: &str, eth: &str) -> Value {
    let (status, value) = s
        .api("POST", "/api/v1/valuation", &s.valuation(btc, eth))
        .await;
    assert_eq!(status, 200, "{value}");
    assert_eq!(value["mode"], "fixture");
    assert_eq!(value["provenance"], "fixture");
    value
}
async fn empty_initial(s: &Harness) {
    let (_, d) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(d["mode"], "fixture");
    assert_eq!(d["provenance"], "fixture");
    for m in d["markets"].as_array().unwrap() {
        assert_eq!(m["state"], "unavailable");
        assert_eq!(m["attempt_state"], "not_attempted");
        assert!(m["last_attempt_at_ms"].is_null());
        assert!(m["observation"].is_null());
    }
    let v = value(s, "0.1", "2").await;
    assert_eq!(v["state"], "incomplete");
    assert!(v["total"].is_null());
    let zero = value(s, "0", "0").await;
    assert_eq!(zero["state"], "complete");
    assert_eq!(zero["total"], "0");
}
async fn finish(s: Harness, worker: Worker) {
    s.stop().await;
    worker.join().unwrap();
}
#[tokio::test(flavor = "current_thread")]
async fn success_fixture_manual_refresh_and_exact_complete_valuation() {
    let (s, w) = fixture(FixtureScenario::Success).await;
    empty_initial(&s).await;
    let d = refresh(&s).await;
    assert_eq!(d["fixture"]["scenario"], "success");
    for m in d["markets"].as_array().unwrap() {
        assert_eq!(m["state"], "success");
        assert_eq!(m["attempt_state"], "success");
        assert_eq!(m["observation"]["provenance"], "fixture");
        assert_eq!(m["observation"]["observed_at_ms"], "1792195200000");
        assert_eq!(m["last_attempt_at_ms"], "1792195200000");
        assert!(m["last_error"].is_null());
    }
    let v = value(&s, "0.1", "2").await;
    assert_eq!(v["holdings"][0]["value"], "6500.012");
    assert_eq!(v["holdings"][1]["value"], "5000.00000002");
    assert_eq!(v["total"], "11500.01200002");
    assert_eq!(v["holdings"][0]["allocation_pct"], "56.52");
    assert_eq!(v["holdings"][1]["allocation_pct"], "43.48");
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn partial_fixture_keeps_exact_btc_value_and_withholds_total() {
    let (s, w) = fixture(FixtureScenario::Partial).await;
    empty_initial(&s).await;
    let d = refresh(&s).await;
    assert_eq!(d["markets"][0]["state"], "success");
    assert_eq!(d["markets"][1]["state"], "unavailable");
    assert_eq!(d["markets"][1]["attempt_state"], "failed");
    assert_eq!(d["markets"][1]["last_error"]["code"], "provider_timeout");
    let v = value(&s, "0.1", "2").await;
    assert_eq!(v["holdings"][0]["value"], "6500.012");
    assert_eq!(v["holdings"][1]["reason"], "quote_missing");
    assert!(v["total"].is_null());
    assert!(v["holdings"][0]["allocation_pct"].is_null());
    assert_eq!(value(&s, "0.1", "0").await["total"], "6500.012");
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn stale_fixture_preload_has_no_attempt_and_retains_quotes_after_simulated_failure() {
    let (s, w) = fixture(FixtureScenario::Stale).await;
    let (_, initial) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(initial["fixture"]["scenario"], "stale");
    for m in initial["markets"].as_array().unwrap() {
        assert_eq!(m["state"], "stale");
        assert_eq!(m["attempt_state"], "not_attempted");
        assert!(m["last_attempt_at_ms"].is_null());
        assert!(m["last_error"].is_null());
        assert_eq!(m["observation_age_ms"], "60001");
        assert_eq!(m["observation"]["observed_at_ms"], "1792195139999");
        assert_eq!(m["observation"]["provenance"], "fixture");
    }
    let v = value(&s, "0.1", "2").await;
    assert_eq!(v["state"], "incomplete");
    assert!(v["total"].is_null());
    for h in v["holdings"].as_array().unwrap() {
        assert_eq!(h["reason"], "quote_stale");
        assert!(h["value"].is_null());
    }
    assert_eq!(value(&s, "0", "0").await["total"], "0");
    let d = refresh(&s).await;
    for (i, m) in d["markets"].as_array().unwrap().iter().enumerate() {
        assert_eq!(m["observation"], initial["markets"][i]["observation"]);
        assert_eq!(m["state"], "stale");
        assert_eq!(m["attempt_state"], "failed");
        assert_eq!(m["last_error"]["code"], "provider_timeout");
        assert_eq!(m["last_attempt_at_ms"], "1792195200000");
    }
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn timeout_fixture_returns_local_failures_without_waiting_or_quotes() {
    let (s, w) = fixture(FixtureScenario::Timeout).await;
    empty_initial(&s).await;
    let d = refresh(&s).await;
    for m in d["markets"].as_array().unwrap() {
        assert_eq!(m["state"], "unavailable");
        assert_eq!(m["attempt_state"], "failed");
        assert_eq!(m["last_error"]["code"], "provider_timeout");
        assert!(m["observation"].is_null());
    }
    assert_eq!(s.clock.millis.load(Ordering::SeqCst), 0);
    assert!(value(&s, "1", "1").await["total"].is_null());
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn rate_limit_fixture_stops_before_eth_and_enforces_exact_simulated_cooldown() {
    let (s, w) = fixture(FixtureScenario::RateLimit).await;
    empty_initial(&s).await;
    let d = refresh(&s).await;
    assert_eq!(
        d["markets"][0]["last_error"]["code"],
        "provider_rate_limited"
    );
    assert_eq!(d["markets"][0]["last_error"]["status"], 429);
    assert_eq!(d["markets"][0]["last_error"]["retry_after_seconds"], "120");
    assert_eq!(d["markets"][1]["attempt_state"], "not_attempted");
    assert!(d["markets"][1]["last_attempt_at_ms"].is_null());
    assert_eq!(d["refresh_allowed_in_ms"], "120000");
    s.clock.advance(119999);
    let rejected = s
        .exchange(&s.request("POST", "/api/v1/refresh", "{}"))
        .await;
    assert!(rejected.to_ascii_lowercase().contains("retry-after: 1"));
    let (status, error) = decode(&rejected);
    assert_eq!(status, 429);
    assert_eq!(error["mode"], "fixture");
    assert_eq!(error["provenance"], "fixture");
    assert_eq!(error["error"]["retry_after_ms"], "1");
    let after = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(after["markets"], d["markets"]);
    s.clock.advance(1);
    let d = refresh(&s).await;
    assert_eq!(d["markets"][0]["last_attempt_at_ms"], "1792195320000");
    assert_eq!(d["refresh_allowed_in_ms"], "120000");
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn unavailable_fixture_simulates_both_503_outcomes_and_zero_holdings() {
    let (s, w) = fixture(FixtureScenario::Unavailable).await;
    empty_initial(&s).await;
    let d = refresh(&s).await;
    for m in d["markets"].as_array().unwrap() {
        assert_eq!(m["attempt_state"], "failed");
        assert_eq!(m["last_error"]["code"], "provider_unavailable");
        assert_eq!(m["last_error"]["status"], 503);
        assert!(m["observation"].is_null());
    }
    assert!(value(&s, "1", "1").await["total"].is_null());
    assert_eq!(value(&s, "0", "0").await["total"], "0");
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn fixture_freshness_and_start_spacing_use_existing_monotonic_boundaries() {
    let (s, w) = fixture(FixtureScenario::Success).await;
    let d = refresh(&s).await;
    s.clock.advance(29999);
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 429);
    s.clock.advance(1);
    assert_eq!(s.app.dashboard()["refresh_allowed_in_ms"], "0");
    s.clock.advance(30000);
    assert_eq!(value(&s, "0.1", "2").await["total"], "11500.01200002");
    s.clock.advance(1);
    let v = value(&s, "0.1", "2").await;
    assert!(v["total"].is_null());
    assert_eq!(v["holdings"][0]["reason"], "quote_stale");
    assert_eq!(s.app.dashboard()["snapshot_id"], d["snapshot_id"]);
    let d = refresh(&s).await;
    assert_eq!(d["markets"][0]["state"], "success");
    assert_eq!(
        d["markets"][0]["observation"]["observed_at_ms"],
        "1792195260001"
    );
    finish(s, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn real_construction_calls_only_injected_factory_and_cannot_import_fixture_state() {
    let (s, w) = fixture(FixtureScenario::Success).await;
    let old = refresh(&s).await;
    finish(s, w).await;
    let real = Harness::configured(false, false, |app| {
        *app = App::for_mode(app.authority.clone(), app.clock.clone(), ServerMode::Real);
    })
    .await;
    let called = Arc::new(AtomicBool::new(false));
    let flag = called.clone();
    let (w, ready) = start_worker(real.app.clone(), move || {
        flag.store(true, Ordering::SeqCst);
        Ok(NoNetwork)
    })
    .unwrap();
    ready.await.unwrap().unwrap();
    assert!(called.load(Ordering::SeqCst));
    let d = real.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(d["mode"], "real");
    assert!(d.get("fixture").is_none());
    assert_ne!(d["snapshot_id"], old["snapshot_id"]);
    for m in d["markets"].as_array().unwrap() {
        assert!(m["observation"].is_null());
        assert_eq!(m["attempt_state"], "not_attempted");
    }
    assert_eq!(
        real.api(
            "POST",
            "/api/v1/valuation",
            &json!({
                "snapshot_id":old["snapshot_id"],"quantities":{"BTC":"0.1","ETH":"2"}
            })
            .to_string()
        )
        .await
        .0,
        409
    );
    finish(real, w).await;
    let (new, w) = fixture(FixtureScenario::Success).await;
    empty_initial(&new).await;
    assert_ne!(new.app.dashboard()["snapshot_id"], old["snapshot_id"]);
    finish(new, w).await;
}
#[tokio::test(flavor = "current_thread")]
async fn fixture_mode_keeps_host_origin_body_schema_and_handler_limits() {
    let (s, w) = fixture(FixtureScenario::Success).await;
    for (request, status) in [
        (
            s.request("POST", "/api/v1/refresh", "{}")
                .replace(&format!("Host: {}", s.address), "Host: attacker.invalid"),
            403,
        ),
        (
            s.request("POST", "/api/v1/refresh", "{}").replace(
                &format!("Origin: http://{}", s.address),
                "Origin: http://127.0.0.1:5173",
            ),
            403,
        ),
        (
            s.request(
                "POST",
                "/api/v1/refresh",
                "{\"url\":\"https://example.invalid\"}",
            ),
            400,
        ),
        (s.request("POST", "/api/v1/refresh", "[]"), 400),
        (s.request("POST", "/api/v1/refresh", &" ".repeat(4097)), 413),
    ] {
        let (actual, error) = decode(&s.exchange(&request).await);
        assert_eq!(actual, status);
        assert_eq!(error["mode"], "fixture");
        assert_eq!(error["provenance"], "fixture");
    }
    let permits: Vec<_> = (0..8).map(|_| s.app.slot(false).unwrap()).collect();
    assert_eq!(s.api("GET", "/api/v1/dashboard", "").await.0, 503);
    drop(permits);
    empty_initial(&s).await;
    s.slots(0, 0).await;
    assert_eq!(s.app.connections.available_permits(), 32);
    finish(s, w).await;
}
