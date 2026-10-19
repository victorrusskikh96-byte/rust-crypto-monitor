use super::*;
use axum::http::StatusCode;
use serde_json::{Value, json};
use std::sync::atomic::AtomicU64;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::{Notify, oneshot},
};

struct ManualTime {
    base: Instant,
    millis: AtomicU64,
    changed: Notify,
}
impl ManualTime {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            base: Instant::now(),
            millis: AtomicU64::new(0),
            changed: Notify::new(),
        })
    }
    fn advance(&self, millis: u64) {
        self.millis.fetch_add(millis, Ordering::SeqCst);
        self.changed.notify_waiters();
    }
}
impl TimeSource for ManualTime {
    fn wall_now(&self) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(1792195200000 + self.millis.load(Ordering::SeqCst))
    }
    fn now(&self) -> Instant {
        self.base + Duration::from_millis(self.millis.load(Ordering::SeqCst))
    }
    fn sleep_until(&self, deadline: Instant) -> SleepFuture<'_> {
        Box::pin(async move {
            loop {
                let change = self.changed.notified();
                tokio::pin!(change);
                change.as_mut().enable();
                if self.now() >= deadline {
                    return;
                }
                change.await;
            }
        })
    }
}

struct Harness {
    address: std::net::SocketAddr,
    app: Arc<App>,
    clock: Arc<ManualTime>,
    shutdown: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<io::Result<()>>,
}
impl Harness {
    async fn new(fixture: bool, gated: bool) -> Self {
        Self::configured(fixture, gated, |_| {}).await
    }
    async fn configured(fixture: bool, gated: bool, configure: impl FnOnce(&mut App)) -> Self {
        let listener = bind(0).await.unwrap();
        let address = listener.local_addr().unwrap();
        let clock = ManualTime::new();
        let mut app = App::new(address.to_string(), clock.clone());
        if fixture {
            app.snapshot.get_mut().unwrap().mode = "fixture";
            for (slot, pair, price) in [
                (0, Pair::BtcUsdt, "65000.12"),
                (1, Pair::EthUsdt, "2500.00000001"),
            ] {
                let observation = PriceObservation {
                    pair,
                    price: price.parse().unwrap(),
                    provider: crate::market_data::types::Provider::Binance,
                    received_at: std::time::UNIX_EPOCH + Duration::from_millis(1792195200000),
                };
                app.snapshot.get_mut().unwrap().markets[slot] = Market {
                    observation: Some(TimedObservation {
                        observation,
                        received: clock.now(),
                    }),
                    last_attempt_at: Some(observation.received_at),
                    last_error: None,
                    loading: false,
                };
            }
        }
        if gated {
            app.processing_gate = Some(Arc::new(Notify::new()));
        }
        configure(&mut app);
        let app = Arc::new(app);
        let (shutdown, receive) = oneshot::channel();
        let task = tokio::spawn(serve(listener, app.clone(), async {
            let _ = receive.await;
        }));
        Self {
            address,
            app,
            clock,
            shutdown,
            task,
        }
    }
    async fn connect(&self) -> TcpStream {
        TcpStream::connect(self.address).await.unwrap()
    }
    async fn exchange(&self, request: &str) -> String {
        let mut socket = self.connect().await;
        socket.write_all(request.as_bytes()).await.unwrap();
        read_closed(&mut socket).await
    }
    fn request(&self, method: &str, path: &str, body: &str) -> String {
        format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\nOrigin: http://{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            self.address,
            self.address,
            body.len()
        )
    }
    fn valuation(&self, btc: &str, eth: &str) -> String {
        json!({"snapshot_id":self.app.state().id,"quantities":{"BTC":btc,"ETH":eth}}).to_string()
    }
    async fn api(&self, method: &str, path: &str, body: &str) -> (u16, Value) {
        decode(&self.exchange(&self.request(method, path, body)).await)
    }
    async fn stop(self) {
        let _ = self.shutdown.send(());
        tokio::time::timeout(Duration::from_secs(5), self.task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
    async fn slots(&self, connections: usize, handlers: usize) {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let changed = self.app.changed.notified();
                tokio::pin!(changed);
                changed.as_mut().enable();
                if self.app.connections.available_permits() == 32 - connections
                    && self.app.handlers.available_permits() == 8 - handlers
                {
                    break;
                }
                changed.await;
            }
        })
        .await
        .unwrap();
    }
}
async fn read_closed(socket: &mut TcpStream) -> String {
    let mut data = Vec::new();
    let result = tokio::time::timeout(Duration::from_secs(5), socket.read_to_end(&mut data))
        .await
        .unwrap();
    if let Err(error) = result {
        assert!(matches!(
            error.kind(),
            io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted
        ));
    }
    String::from_utf8(data).unwrap()
}
fn decode(response: &str) -> (u16, Value) {
    let (headers, body) = response.split_once("\r\n\r\n").expect(response);
    let status = headers.split_whitespace().nth(1).unwrap().parse().unwrap();
    let lower = headers.to_ascii_lowercase();
    assert!(lower.contains("cache-control: no-store"), "{headers}");
    assert!(
        lower.contains("content-type: application/json"),
        "{headers}"
    );
    assert!(lower.contains("connection: close"), "{headers}");
    assert!(!lower.contains("access-control-allow"));
    assert!(body.len() <= 32768);
    (status, serde_json::from_str(body).expect(body))
}

#[tokio::test(flavor = "current_thread")]
async fn startup_binds_only_ipv4_loopback_and_rejects_other_listeners() {
    let server = Harness::new(false, false).await;
    assert_eq!(server.address.ip(), std::net::Ipv4Addr::LOCALHOST);
    let public = tokio::net::TcpListener::bind("0.0.0.0:0").await.unwrap();
    assert!(
        serve(public, server.app.clone(), std::future::pending())
            .await
            .is_err()
    );
    server.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn initial_dashboard_has_exact_empty_contract_and_no_provider_state_changes() {
    let s = Harness::new(false, false).await;
    let (status, dashboard) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(status, 200);
    assert_eq!(
        dashboard,
        json!({
        "schema_version":1,"mode":"real","snapshot_id":s.app.state().id,
        "freshness_ttl_ms":"60000","refresh_in_progress":false,"service_state":"ready",
        "service_error":null,"refresh_allowed_in_ms":"0",
        "markets":[
            {"pair":"BTC/USDT","state":"unavailable","observation":null,"observation_age_ms":null,"last_attempt_at_ms":null,"last_success_at_ms":null,"attempt_state":"not_attempted","last_error":null},
            {"pair":"ETH/USDT","state":"unavailable","observation":null,"observation_age_ms":null,"last_attempt_at_ms":null,"last_success_at_ms":null,"attempt_state":"not_attempted","last_error":null}
        ]})
    );
    for _ in 0..3 {
        let (_, value) = s
            .api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await;
        assert_eq!(value["state"], "incomplete");
        assert_eq!(s.api("GET", "/api/v1/dashboard", "").await.1, dashboard);
    }
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn zero_holdings_without_quotes_are_complete_exact_zero() {
    let s = Harness::new(false, false).await;
    let (status, value) = s
        .api(
            "POST",
            "/api/v1/valuation",
            &s.valuation("000.00000000", "0"),
        )
        .await;
    assert_eq!(status, 200);
    assert_eq!(value["state"], "complete");
    assert_eq!(value["total"], "0");
    assert_eq!(value["holdings"][0]["quantity"], "0");
    for h in value["holdings"].as_array().unwrap() {
        assert_eq!(h["value"], "0");
        assert!(h["allocation_pct"].is_null());
        assert!(h["price"].is_null());
    }
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn fixture_valuation_preserves_all_decimal_digits_and_contract() {
    let s = Harness::new(true, false).await;
    let (status, value) = s
        .api("POST", "/api/v1/valuation", &s.valuation("0.1", "2"))
        .await;
    assert_eq!(status, 200);
    assert_eq!(
        value,
        json!({"snapshot_id":s.app.state().id,"quote":"USDT","state":"complete",
        "holdings":[
        {"asset":"BTC","quantity":"0.1","price":"65000.12","value":"6500.012","allocation_pct":"56.52","reason":null},
        {"asset":"ETH","quantity":"2","price":"2500.00000001","value":"5000.00000002","allocation_pct":"43.48","reason":null}],
        "total":"11500.01200002","allocation_rounding":"independent_half_even_2dp","estimate":true})
    );
    let (_, dashboard) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(dashboard["mode"], "fixture");
    assert_eq!(
        dashboard["markets"][0]["observation"],
        json!({"price":"65000.12","quote":"USDT","provider":"Binance","observed_at_ms":"1792195200000","provenance":"fixture"})
    );
    assert_eq!(dashboard["markets"][1]["attempt_state"], "success");
    assert_eq!(dashboard["markets"][0]["observation_age_ms"], "0");
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn freshness_boundary_uses_server_monotonic_age_not_snapshot_id_or_wall_time() {
    let s = Harness::new(true, false).await;
    s.clock.advance(60000);
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["state"],
        "complete"
    );
    s.clock.advance(1);
    let (_, value) = s
        .api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
        .await;
    assert_eq!(value["state"], "incomplete");
    assert!(value["total"].is_null());
    for holding in value["holdings"].as_array().unwrap() {
        assert_eq!(holding["reason"], "quote_stale");
        assert!(holding["allocation_pct"].is_null());
    }
    let (_, dashboard) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(dashboard["snapshot_id"], s.app.state().id);
    assert_eq!(dashboard["markets"][0]["state"], "stale");
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn snapshot_mismatch_rejects_without_using_newer_prices() {
    let s = Harness::new(true, false).await;
    let body = json!({"snapshot_id":"old","quantities":{"BTC":"1","ETH":"2"}}).to_string();
    let (status, value) = s.api("POST", "/api/v1/valuation", &body).await;
    assert_eq!(status, 409);
    assert_eq!(value["error"]["code"], "snapshot_replaced");
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn invalid_quantities_are_sanitized_with_allowlisted_field_names() {
    let s = Harness::new(true, false).await;
    for quantity in [
        "-1",
        "+1",
        "1e2",
        "NaN",
        "1.000000001",
        "1000001",
        "",
        " sensitive-input ",
    ] {
        let (status, value) = s
            .api("POST", "/api/v1/valuation", &s.valuation(quantity, "0"))
            .await;
        assert_eq!(status, 400);
        assert_eq!(
            value,
            json!({"error":{"code":"invalid_quantity","message":"Enter an unsigned decimal quantity","field":"quantities.BTC"}})
        );
    }
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn strict_json_rejects_unknown_duplicate_missing_and_client_market_fields() {
    let s = Harness::new(false, false).await;
    let valid = s.valuation("1", "2");
    let id = s.app.state().id.clone();
    let cases = [
        "{".into(),
        "[]".into(),
        "null".into(),
        "{}".into(),
        format!("{valid} trailing"),
        format!(r#"{{"snapshot_id":"{id}","quantities":{{"BTC":"1","BTC":"2","ETH":"0"}}}}"#),
        format!(
            r#"{{"snapshot_id":"{id}","snapshot_id":"{id}","quantities":{{"BTC":"1","ETH":"0"}}}}"#
        ),
        format!(r#"{{"snapshot_id":"{id}","quantities":{{"BTC":1,"ETH":"0"}}}}"#),
        format!(r#"{{"snapshot_id":"{id}","quantities":{{"BTC":"1"}}}}"#),
        format!(r#"{{"snapshot_id":"{id}","quantities":{{"BTC":"1","ETH":"0","SOL":"1"}}}}"#),
        format!(
            r#"{{"snapshot_id":"{id}","quantities":{{"BTC":"1","ETH":"0"}},"prices":{{"BTC":"1"}},"age":"0","fresh":true}}"#
        ),
        json!({"snapshot_id":"x".repeat(129),"quantities":{"BTC":"1","ETH":"0"}}).to_string(),
        json!({"snapshot_id":"","quantities":{"BTC":"1","ETH":"0"}}).to_string(),
    ];
    for body in cases {
        let (status, value) = s.api("POST", "/api/v1/valuation", &body).await;
        assert_eq!(status, 400, "{body}");
        assert!(value.get("error").is_some());
        assert!(!value.to_string().contains("trailing"));
    }
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn host_origin_checks_apply_to_reads_posts_and_forwarding_headers() {
    let s = Harness::new(false, false).await;
    let request = s.request("GET", "/api/v1/dashboard", "");
    for bad in ["localhost:3000", "127.0.0.1:3000.evil", "evil.example"] {
        assert_eq!(
            decode(
                &s.exchange(
                    &request.replace(&format!("Host: {}", s.address), &format!("Host: {bad}"))
                )
                .await
            )
            .0,
            403
        );
    }
    for bad in [
        "null",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://evil.example",
        "http://127.0.0.1:3000.evil",
    ] {
        assert_eq!(
            decode(
                &s.exchange(&request.replace(
                    &format!("Origin: http://{}", s.address),
                    &format!("Origin: {bad}")
                ))
                .await
            )
            .0,
            403
        );
    }
    let no_origin = request.replace(&format!("Origin: http://{}\r\n", s.address), "");
    assert_eq!(decode(&s.exchange(&no_origin).await).0, 200);
    let post = s.request("POST", "/api/v1/valuation", &s.valuation("0", "0"));
    assert_eq!(
        decode(
            &s.exchange(&post.replace(&format!("Origin: http://{}\r\n", s.address), ""))
                .await
        )
        .0,
        403
    );
    let duplicate = request.replace(
        "Origin:",
        &format!("Origin: http://{}\r\nOrigin:", s.address),
    );
    assert_eq!(decode(&s.exchange(&duplicate).await).0, 403);
    let forwarded = request.replace(
        "Origin:",
        "X-Forwarded-Host: evil.example\r\nForwarded: host=evil.example\r\nOrigin:",
    );
    assert_eq!(decode(&s.exchange(&forwarded).await).0, 200);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn methods_media_types_queries_and_bodies_fail_safely() {
    let s = Harness::new(false, false).await;
    for (method, path, body, status) in [
        ("OPTIONS", "/api/v1/dashboard", "", 405),
        ("HEAD", "/api/v1/dashboard", "", 405),
        ("PUT", "/api/v1/valuation", "{}", 405),
        ("GET", "/missing", "", 404),
        ("GET", "/api/v1/dashboard?x=1", "", 400),
        ("GET", "/api/v1/dashboard", "{}", 400),
    ] {
        let response = s.exchange(&s.request(method, path, body)).await;
        if method == "HEAD" {
            assert!(response.starts_with("HTTP/1.1 405"));
            assert!(response.to_lowercase().contains("cache-control: no-store"));
        } else {
            assert_eq!(decode(&response).0, status);
        }
    }
    let post = s.request("POST", "/api/v1/valuation", &s.valuation("0", "0"));
    for media in [
        "text/plain",
        "application/x-www-form-urlencoded",
        "application/json; charset=latin1",
        "application/json; extra=1",
    ] {
        assert_eq!(
            decode(&s.exchange(&post.replace("application/json", media)).await).0,
            415
        );
    }
    assert_eq!(
        decode(
            &s.exchange(&post.replace("Content-Type: application/json\r\n", ""))
                .await
        )
        .0,
        415
    );
    assert_eq!(
        decode(
            &s.exchange(&post.replace("application/json", "application/json; charset=utf-8"))
                .await
        )
        .0,
        200
    );
    assert_eq!(
        decode(
            &s.exchange(&post.replace("Content-Type:", "Content-Encoding: gzip\r\nContent-Type:"))
                .await
        )
        .0,
        415
    );
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn body_caps_cover_declared_chunked_and_exact_boundary_inputs() {
    let s = Harness::new(false, false).await;
    let valid = s.valuation("0", "0");
    let exact = format!("{valid}{}", " ".repeat(4096 - valid.len()));
    assert_eq!(s.api("POST", "/api/v1/valuation", &exact).await.0, 200);
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &format!("{exact} "))
            .await
            .0,
        413
    );
    let chunked = format!(
        "POST /api/v1/valuation HTTP/1.1\r\nHost: {}\r\nOrigin: http://{}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n1001\r\n{}\r\n0\r\n\r\n",
        s.address,
        s.address,
        "x".repeat(4097)
    );
    assert_eq!(decode(&s.exchange(&chunked).await).0, 413);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn parser_header_target_and_upgrade_limits_close_or_return_safe_errors() {
    let s = Harness::new(false, false).await;
    let request = s.request("GET", "/api/v1/dashboard", "");
    let too_many = request.replace(
        "Origin:",
        &format!("{}Origin:", "X-Extra: x\r\n".repeat(65)),
    );
    let too_large = request.replace(
        "Origin:",
        &format!("X-Large: {}\r\nOrigin:", "x".repeat(16384)),
    );
    for raw in [
        too_many,
        too_large,
        "G@T / HTTP/1.1\r\nHost: secret-invalid-host\r\n\r\n".into(),
    ] {
        assert!(
            s.exchange(&raw).await.is_empty(),
            "early parser rejection must close before emitting a framework response"
        );
    }
    assert_eq!(
        s.api("GET", &format!("/{}", "x".repeat(2049)), "").await.0,
        400
    );
    let upgrade = request.replace(
        "Origin:",
        "Upgrade: websocket\r\nConnection: upgrade\r\nOrigin:",
    );
    assert_eq!(decode(&s.exchange(&upgrade).await).0, 400);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn eight_slow_api_handlers_reject_ninth_without_queueing() {
    let s = Harness::new(false, false).await;
    let mut held = Vec::new();
    for _ in 0..8 {
        let mut connection = s.connect().await;
        let headers = s.request("POST", "/api/v1/valuation", " ");
        connection
            .write_all(headers.trim_end_matches(' ').as_bytes())
            .await
            .unwrap();
        held.push(connection);
    }
    s.slots(8, 8).await;
    let (status, value) = s.api("GET", "/api/v1/dashboard", "").await;
    assert_eq!(status, 503);
    assert_eq!(value["error"]["code"], "overloaded");
    s.clock.advance(5000);
    for connection in &mut held {
        assert!(read_closed(connection).await.is_empty());
    }
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn thirty_two_tracked_sockets_close_excess_before_spawning() {
    let s = Harness::new(false, false).await;
    let mut held = Vec::new();
    for _ in 0..32 {
        held.push(s.connect().await);
    }
    s.slots(32, 0).await;
    let mut excess = s.connect().await;
    assert!(read_closed(&mut excess).await.is_empty());
    assert_eq!(s.app.connections.available_permits(), 0);
    s.clock.advance(5000);
    for socket in &mut held {
        assert!(read_closed(socket).await.is_empty());
    }
    s.slots(0, 0).await;
    assert_eq!(s.api("GET", "/api/v1/dashboard", "").await.0, 200);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn header_and_body_share_one_five_second_budget() {
    let s = Harness::new(false, false).await;
    let mut socket = s.connect().await;
    s.slots(1, 0).await;
    s.clock.advance(4000);
    let headers = s.request("POST", "/api/v1/valuation", " ");
    socket
        .write_all(headers.trim_end_matches(' ').as_bytes())
        .await
        .unwrap();
    s.slots(1, 1).await;
    s.clock.advance(1000);
    assert!(read_closed(&mut socket).await.is_empty());
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn silent_header_timeout_closes_connection_with_controlled_time() {
    let s = Harness::new(false, false).await;
    let mut socket = s.connect().await;
    s.slots(1, 0).await;
    s.clock.advance(5000);
    assert!(read_closed(&mut socket).await.is_empty());
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn response_budget_closes_a_blocked_handler_after_twenty_five_seconds() {
    let s = Harness::new(false, true).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("GET", "/api/v1/dashboard", "").as_bytes())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), s.app.processing_entered.notified())
        .await
        .unwrap();
    s.clock.advance(25000);
    assert!(read_closed(&mut socket).await.is_empty());
    s.slots(0, 0).await;
    s.stop().await;
}
#[test]
fn bounded_responses_and_internal_errors_are_sanitized() {
    let response = json_response(StatusCode::OK, &json!({"sensitive":"x".repeat(32769)}));
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(
        timestamp(std::time::UNIX_EPOCH - Duration::from_millis(1)),
        Some("-1".into())
    );
}

#[tokio::test(flavor = "current_thread")]
async fn missing_one_quote_preserves_fresh_holding_without_presenting_partial_total() {
    for missing in [0, 1] {
        let s = Harness::configured(true, false, |app| {
            app.snapshot.get_mut().unwrap().markets[missing] = Market::default()
        })
        .await;
        let (_, value) = s
            .api("POST", "/api/v1/valuation", &s.valuation("0.1", "2"))
            .await;
        assert_eq!(value["state"], "incomplete");
        assert!(value["total"].is_null());
        assert_eq!(value["holdings"][missing]["reason"], "quote_missing");
        assert!(value["holdings"][1 - missing]["value"].is_string());
        assert!(value["holdings"][1 - missing]["allocation_pct"].is_null());
        let quantities = if missing == 0 {
            ("0", "2")
        } else {
            ("0.1", "0")
        };
        assert_eq!(
            s.api(
                "POST",
                "/api/v1/valuation",
                &s.valuation(quantities.0, quantities.1)
            )
            .await
            .1["state"],
            "complete"
        );
        s.stop().await;
    }
}
#[tokio::test(flavor = "current_thread")]
async fn exact_financial_errors_map_to_distinct_422_codes() {
    for (price, quantity, code) in [
        (
            "0.0000000000000000000000000001",
            "0.1",
            "unrepresentable_value",
        ),
        (
            "79228162514264337593543950335",
            "999999.99999999",
            "arithmetic_capacity",
        ),
    ] {
        let s = Harness::configured(true, false, |app| {
            app.snapshot.get_mut().unwrap().markets[0]
                .observation
                .as_mut()
                .unwrap()
                .observation
                .price = price.parse().unwrap()
        })
        .await;
        let (status, value) = s
            .api("POST", "/api/v1/valuation", &s.valuation(quantity, "0"))
            .await;
        assert_eq!(status, 422);
        assert_eq!(value["error"]["code"], code);
        assert!(value.get("total").is_none());
        s.stop().await;
    }
}
#[tokio::test(flavor = "current_thread")]
async fn minimum_exact_monetary_scale_serializes_as_plain_string() {
    let s = Harness::configured(true, false, |app| {
        app.snapshot.get_mut().unwrap().markets[0]
            .observation
            .as_mut()
            .unwrap()
            .observation
            .price = "0.00000000000000000001".parse().unwrap()
    })
    .await;
    let (status, value) = s
        .api("POST", "/api/v1/valuation", &s.valuation("0.00000001", "0"))
        .await;
    assert_eq!(status, 200);
    assert_eq!(value["total"], "0.0000000000000000000000000001");
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn internal_quote_invariant_failure_returns_no_input_or_internal_details() {
    let s = Harness::configured(true, false, |app| {
        app.snapshot.get_mut().unwrap().markets[0]
            .observation
            .as_mut()
            .unwrap()
            .observation
            .pair = Pair::EthUsdt
    })
    .await;
    let (status, value) = s
        .api("POST", "/api/v1/valuation", &s.valuation("1", "0"))
        .await;
    assert_eq!(status, 500);
    assert_eq!(
        value,
        json!({"error":{"code":"internal_error","message":"Internal service error"}})
    );
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn missing_and_duplicate_hosts_cannot_be_rescued_by_forwarding_headers() {
    let s = Harness::new(false, false).await;
    let request = s.request("GET", "/api/v1/dashboard", "");
    let missing = request.replace(
        &format!("Host: {}\r\n", s.address),
        "X-Forwarded-Host: 127.0.0.1:3000\r\n",
    );
    let duplicate = request.replace("Host:", &format!("Host: {}\r\nHost:", s.address));
    for raw in [missing, duplicate] {
        let response = s.exchange(&raw).await;
        assert!(response.is_empty() || decode(&response).0 == 403);
    }
    let absolute = s.request("GET", &format!("http://{}/api/v1/dashboard", s.address), "");
    assert_eq!(decode(&s.exchange(&absolute).await).0, 400);
    let expect = s
        .request("POST", "/api/v1/valuation", &s.valuation("0", "0"))
        .replace("Origin:", "Expect: 100-continue\r\nOrigin:");
    assert_eq!(decode(&s.exchange(&expect).await).0, 400);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn exact_header_count_and_size_limits_accept_boundary_then_close_excess() {
    let s = Harness::new(false, false).await;
    let request = s.request("GET", "/api/v1/dashboard", "");
    let at_count = request.replace("Origin:", &format!("{}Origin:", "X-Test: x\r\n".repeat(60)));
    assert_eq!(decode(&s.exchange(&at_count).await).0, 200);
    let prefix = "X-Padding: ";
    let padding = 16384 - request.len() - prefix.len() - 2;
    let exact = request.replace(
        "Origin:",
        &format!("{prefix}{}\r\nOrigin:", "x".repeat(padding)),
    );
    assert_eq!(exact.len(), 16384);
    assert_eq!(decode(&s.exchange(&exact).await).0, 200);
    let over = exact.replacen("X-Padding: ", "X-Padding: x", 1);
    assert!(s.exchange(&over).await.is_empty());
    assert_eq!(
        s.api("GET", &format!("/{}", "x".repeat(2047)), "").await.0,
        404
    );
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn malformed_chunk_frames_close_or_return_sanitized_bad_request() {
    let s = Harness::new(false, false).await;
    let raw = format!(
        "POST /api/v1/valuation HTTP/1.1\r\nHost: {}\r\nOrigin: http://{}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\nnot-a-size\r\nsecret-chunk-content\r\n",
        s.address, s.address
    );
    let response = s.exchange(&raw).await;
    assert!(!response.contains("secret-chunk-content"));
    if !response.is_empty() {
        assert_eq!(decode(&response).0, 400);
    }
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn expired_deadline_wins_when_handler_completion_becomes_ready_simultaneously() {
    let s = Harness::new(false, true).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("GET", "/api/v1/dashboard", "").as_bytes())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), s.app.processing_entered.notified())
        .await
        .unwrap();
    s.app.processing_gate.as_ref().unwrap().notify_one();
    s.clock.advance(25000);
    assert!(read_closed(&mut socket).await.is_empty());
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn validated_request_gets_full_response_budget_after_body_read() {
    let s = Harness::new(false, true).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("GET", "/api/v1/dashboard", "").as_bytes())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), s.app.processing_entered.notified())
        .await
        .unwrap();
    s.clock.advance(24999);
    // Let the deadline select observe the elapsed read budget while processing remains pending.
    tokio::task::yield_now().await;
    s.app.processing_gate.as_ref().unwrap().notify_one();
    assert_eq!(decode(&read_closed(&mut socket).await).0, 200);
    s.stop().await;
}
#[tokio::test(flavor = "current_thread")]
async fn stopping_rejects_new_valuations_and_graceful_shutdown_drains_connections() {
    let s = Harness::new(false, false).await;
    s.app.stopping.store(true, Ordering::Release);
    let (status, error) = s
        .api("POST", "/api/v1/valuation", &s.valuation("0", "0"))
        .await;
    assert_eq!(status, 503);
    assert_eq!(error["error"]["code"], "service_stopping");
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["service_state"],
        "stopping"
    );
    s.stop().await;
}
#[test]
fn negative_fractional_unix_milliseconds_floor_before_epoch() {
    assert_eq!(
        timestamp(UNIX_EPOCH - Duration::from_nanos(100)),
        Some("-1".into())
    );
    assert_eq!(
        timestamp(UNIX_EPOCH - Duration::from_nanos(1000100)),
        Some("-2".into())
    );
}

#[tokio::test(flavor = "current_thread")]
async fn shutdown_stops_acceptance_and_finishes_bounded_drain_without_detached_tasks() {
    let s = Harness::new(false, true).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("GET", "/api/v1/dashboard", "").as_bytes())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), s.app.processing_entered.notified())
        .await
        .unwrap();
    let _ = s.shutdown.send(());
    tokio::time::timeout(Duration::from_secs(5), async {
        while !s.app.stopping.load(Ordering::Acquire) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    s.clock.advance(25000);
    assert!(read_closed(&mut socket).await.is_empty());
    tokio::time::timeout(Duration::from_secs(5), s.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(s.app.connections.available_permits(), 32);
    assert_eq!(s.app.handlers.available_permits(), 8);
    assert!(TcpStream::connect(s.address).await.is_err());
}

#[path = "worker_tests.rs"]
mod worker_tests;

#[path = "fixture_tests.rs"]
mod fixture_tests;
