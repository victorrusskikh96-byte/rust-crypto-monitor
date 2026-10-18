use super::*;
use crate::market_data::transport::{
    HttpTransport, MarketDataRequest, TransportFailure, TransportResponse,
};
use crate::market_data::types::MarketDataError;
use std::sync::{Mutex, mpsc};
use tokio::io::AsyncWriteExt;
use tokio::sync::oneshot;

struct Step {
    result: Result<TransportResponse, TransportFailure>,
    entered: Option<oneshot::Sender<()>>,
    release: Option<mpsc::Receiver<()>>,
    panic: bool,
}
fn success(pair: Pair) -> Step {
    Step {
        result: Ok(TransportResponse {
            status: 200,
            retry_after: None,
            body: match pair {
                Pair::BtcUsdt => {
                    include_bytes!("../../tests/fixtures/market_data/btc_ticker.json").to_vec()
                }
                Pair::EthUsdt => {
                    include_bytes!("../../tests/fixtures/market_data/eth_ticker.json").to_vec()
                }
            },
        }),
        entered: None,
        release: None,
        panic: false,
    }
}
fn limited(status: u16, retry: Option<&str>) -> Step {
    Step {
        result: Ok(TransportResponse {
            status,
            retry_after: retry.map(|s| s.as_bytes().to_vec()),
            body: vec![],
        }),
        ..success(Pair::BtcUsdt)
    }
}
fn blocked(mut step: Step) -> (Step, oneshot::Receiver<()>, mpsc::SyncSender<()>) {
    let (entered, receive) = oneshot::channel();
    let (release, wait) = mpsc::sync_channel(1);
    step.entered = Some(entered);
    step.release = Some(wait);
    (step, receive, release)
}
struct Script {
    steps: std::collections::VecDeque<Step>,
    calls: Arc<Mutex<Vec<Pair>>>,
    owner: std::thread::ThreadId,
}
impl HttpTransport for Script {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        assert_eq!(self.owner, std::thread::current().id());
        assert!(tokio::runtime::Handle::try_current().is_err());
        self.calls.lock().unwrap().push(request.pair());
        let step = self.steps.pop_front().expect("unexpected provider call");
        if let Some(entered) = step.entered {
            let _ = entered.send(());
        }
        if let Some(release) = step.release {
            release.recv().unwrap();
        }
        assert!(!step.panic, "scripted worker termination");
        step.result
    }
}
impl Drop for Script {
    fn drop(&mut self) {
        assert_eq!(self.owner, std::thread::current().id());
        assert!(tokio::runtime::Handle::try_current().is_err());
    }
}
async fn attach(s: &Harness, steps: Vec<Step>) -> (Worker, Arc<Mutex<Vec<Pair>>>) {
    let calls = Arc::new(Mutex::new(vec![]));
    let log = calls.clone();
    let (worker, ready) = Worker::start(s.app.clone(), move || {
        assert!(tokio::runtime::Handle::try_current().is_err());
        Ok(Script {
            steps: steps.into(),
            calls: log,
            owner: std::thread::current().id(),
        })
    })
    .unwrap();
    ready.await.unwrap().unwrap();
    (worker, calls)
}
async fn settled(app: &App) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let changed = app.worker_changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            if !app.snapshot.lock().unwrap().busy {
                break;
            }
            changed.await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn explicit_refresh_alone_fetches_btc_then_eth_and_values_exactly() {
    let s = Harness::new(false, false).await;
    let (worker, calls) = attach(&s, vec![success(Pair::BtcUsdt), success(Pair::EthUsdt)]).await;
    let initial = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert!(calls.lock().unwrap().is_empty());
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["state"],
        "incomplete"
    );
    let (status, result) = s.api("POST", "/api/v1/refresh", "{}").await;
    assert_eq!(status, 200);
    assert_ne!(initial["snapshot_id"], result["snapshot_id"]);
    assert_eq!(*calls.lock().unwrap(), [Pair::BtcUsdt, Pair::EthUsdt]);
    for market in result["markets"].as_array().unwrap() {
        assert_eq!(market["state"], "success");
        assert_eq!(market["attempt_state"], "success");
        assert_eq!(market["observation"]["provenance"], "real");
    }
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &s.valuation("0.1", "2"))
            .await
            .1["total"],
        "11500.01200002"
    );
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn disconnect_keeps_admission_and_dashboard_responsive_until_actual_completion() {
    let s = Harness::new(false, false).await;
    let (btc, entered, release) = blocked(success(Pair::BtcUsdt));
    let (worker, calls) = attach(&s, vec![btc, success(Pair::EthUsdt)]).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    drop(socket);
    let dashboard = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(dashboard["refresh_in_progress"], true);
    assert_eq!(dashboard["markets"][0]["attempt_state"], "loading");
    assert_eq!(dashboard["markets"][1]["attempt_state"], "not_attempted");
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 409);
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["error"]["code"],
        "refresh_in_progress"
    );
    release.send(()).unwrap();
    settled(&s.app).await;
    assert_eq!(calls.lock().unwrap().len(), 2);
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 429);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn rate_limits_stop_btc_batch_and_enforce_checked_monotonic_cooldowns() {
    for (status, retry, duration, disabled) in [
        (418, None, 60000, false),
        (429, Some("0"), 60000, false),
        (429, Some("120"), 120000, false),
        (429, Some("18446744073709551616"), 60000, false),
        (429, Some("18446744073709551615"), 0, true),
    ] {
        let s = Harness::new(false, false).await;
        let (worker, calls) = attach(
            &s,
            vec![
                limited(status, retry),
                success(Pair::BtcUsdt),
                success(Pair::EthUsdt),
            ],
        )
        .await;
        let (code, dashboard) = s.api("POST", "/api/v1/refresh", "{}").await;
        assert_eq!(code, 200);
        assert_eq!(*calls.lock().unwrap(), [Pair::BtcUsdt]);
        assert_eq!(
            dashboard["markets"][0]["last_error"]["code"],
            "provider_rate_limited"
        );
        assert_eq!(dashboard["markets"][1]["attempt_state"], "not_attempted");
        if disabled {
            assert_eq!(
                dashboard["service_error"]["code"],
                "cooldown_unrepresentable"
            );
            assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
        } else {
            let unchanged = dashboard["markets"].clone();
            assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 429);
            assert_eq!(
                s.api("GET", "/api/v1/dashboard", "").await.1["markets"],
                unchanged
            );
            s.clock.advance(duration - 1);
            let raw = s
                .exchange(&s.request("POST", "/api/v1/refresh", "{}"))
                .await;
            assert!(raw.to_ascii_lowercase().contains("retry-after: 1\r\n"));
            assert_eq!(decode(&raw).1["error"]["retry_after_ms"], "1");
            s.clock.advance(1);
            assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 200);
            assert_eq!(calls.lock().unwrap().len(), 3);
        }
        s.stop().await;
        worker.join().unwrap();
    }
}

#[tokio::test(flavor = "current_thread")]
async fn eth_rate_limit_preserves_successful_btc_and_cooldown_starts_at_failure() {
    let s = Harness::new(false, false).await;
    let (eth, entered, release) = blocked(limited(429, Some("120")));
    let (worker, calls) = attach(&s, vec![success(Pair::BtcUsdt), eth]).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    s.clock.advance(10000);
    release.send(()).unwrap();
    let result = decode(&read_closed(&mut socket).await).1;
    assert_eq!(result["markets"][0]["state"], "success");
    assert_eq!(result["markets"][1]["last_error"]["status"], 429);
    assert_eq!(result["refresh_allowed_in_ms"], "120000");
    assert_eq!(calls.lock().unwrap().len(), 2);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn ordinary_failures_continue_and_retained_prices_are_immediately_stale() {
    let s = Harness::new(true, false).await;
    let fail = Step {
        result: Err(TransportFailure::Timeout),
        ..success(Pair::BtcUsdt)
    };
    let (worker, calls) = attach(&s, vec![fail, success(Pair::EthUsdt)]).await;
    let result = s.api("POST", "/api/v1/refresh", "{}").await;
    assert_eq!(result.0, 200);
    assert_eq!(result.1["markets"][0]["state"], "stale");
    assert_eq!(
        result.1["markets"][0]["last_error"]["code"],
        "provider_timeout"
    );
    assert_eq!(result.1["markets"][1]["state"], "success");
    let valuation = s
        .api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
        .await
        .1;
    assert_eq!(valuation["state"], "incomplete");
    assert!(valuation["total"].is_null());
    assert!(valuation["holdings"][0]["value"].is_null());
    assert_eq!(calls.lock().unwrap().len(), 2);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn waiter_deadline_returns_504_without_releasing_admission_or_retrying() {
    let s = Harness::new(false, false).await;
    let (btc, entered, release) = blocked(success(Pair::BtcUsdt));
    let (worker, calls) = attach(&s, vec![btc, success(Pair::EthUsdt)]).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    s.clock.advance(25000);
    let result = decode(&read_closed(&mut socket).await);
    assert_eq!(result.0, 504);
    assert_eq!(result.1["error"]["code"], "refresh_wait_timeout");
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 409);
    assert_eq!(calls.lock().unwrap().len(), 1);
    release.send(()).unwrap();
    settled(&s.app).await;
    assert_eq!(calls.lock().unwrap().len(), 2);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn concurrent_requests_admit_one_and_minimum_start_interval_has_exact_boundary() {
    let s = Harness::new(false, false).await;
    let (btc, entered, release) = blocked(success(Pair::BtcUsdt));
    let (worker, calls) = attach(
        &s,
        vec![
            btc,
            success(Pair::EthUsdt),
            success(Pair::BtcUsdt),
            success(Pair::EthUsdt),
        ],
    )
    .await;
    let mut a = s.connect().await;
    let mut b = s.connect().await;
    let request = s.request("POST", "/api/v1/refresh", "{}");
    let (ra, rb) = tokio::join!(
        a.write_all(request.as_bytes()),
        b.write_all(request.as_bytes())
    );
    ra.unwrap();
    rb.unwrap();
    entered.await.unwrap();
    // Both sockets have been dispatched before the fake transport can finish.
    let (ar, br) = tokio::select! {
        first = read_closed(&mut a) => { release.send(()).unwrap(); (first,read_closed(&mut b).await) },
        first = read_closed(&mut b) => { release.send(()).unwrap(); (read_closed(&mut a).await,first) },
    };
    let codes = [decode(&ar).0, decode(&br).0];
    assert!(codes == [200, 409] || codes == [409, 200]);
    assert_eq!(calls.lock().unwrap().len(), 2);
    s.clock.advance(29999);
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 429);
    s.clock.advance(1);
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 200);
    assert_eq!(calls.lock().unwrap().len(), 4);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn validation_precedes_service_busy_and_cooldown_and_never_changes_attempts() {
    let s = Harness::new(false, false).await;
    let (worker, calls) = attach(&s, vec![]).await;
    let initial = s.api("GET", "/api/v1/dashboard", "").await.1;
    for body in [
        "",
        "[]",
        "null",
        "0",
        "{\"url\":\"secret\"}",
        "{\"x\":1,\"x\":1}",
        "{}{}",
    ] {
        assert_eq!(s.api("POST", "/api/v1/refresh", body).await.0, 400);
    }
    for (from, to, code) in [
        (
            format!("Host: {}", s.address),
            String::from("Host: evil.invalid"),
            403,
        ),
        (
            format!("Origin: http://{}", s.address),
            String::from("Origin: null"),
            403,
        ),
        (
            "Content-Type: application/json".into(),
            String::from("Content-Type: text/plain"),
            415,
        ),
    ] {
        let raw = s
            .request("POST", "/api/v1/refresh", "{}")
            .replace(&from, &to);
        assert_eq!(decode(&s.exchange(&raw).await).0, code);
    }
    s.app.stop();
    assert_eq!(s.api("POST", "/api/v1/refresh", "[]").await.0, 400);
    assert_eq!(
        s.api("POST", "/api/v1/refresh", "{}").await.1["error"]["code"],
        "service_stopping"
    );
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["markets"],
        initial["markets"]
    );
    assert!(calls.lock().unwrap().is_empty());
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn shutdown_during_first_call_publishes_only_actual_outcome_and_skips_eth() {
    let s = Harness::new(false, false).await;
    let (btc, entered, release) = blocked(success(Pair::BtcUsdt));
    let (worker, calls) = attach(&s, vec![btc]).await;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    s.app.stop();
    assert_eq!(decode(&read_closed(&mut socket).await).0, 503);
    assert!(s.app.snapshot.lock().unwrap().busy);
    release.send(()).unwrap();
    settled(&s.app).await;
    let dashboard = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(dashboard["markets"][0]["state"], "success");
    assert_eq!(dashboard["markets"][1]["attempt_state"], "not_attempted");
    assert!(dashboard["markets"][1]["last_attempt_at_ms"].is_null());
    assert_eq!(*calls.lock().unwrap(), [Pair::BtcUsdt]);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn initialization_failure_and_unexpected_termination_disable_refresh_without_respawn() {
    let s = Harness::new(false, false).await;
    let (worker, ready) = Worker::start(s.app.clone(), || {
        Err::<Script, _>(MarketDataError::ClientInitialization)
    })
    .unwrap();
    assert!(ready.await.unwrap().is_err());
    worker.join().unwrap();
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["service_state"],
        "failed"
    );
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    s.stop().await;
    let s = Harness::new(false, false).await;
    let (worker, calls) = attach(
        &s,
        vec![Step {
            panic: true,
            ..success(Pair::BtcUsdt)
        }],
    )
    .await;
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    assert!(worker.join().is_err());
    let result = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(result["service_state"], "failed");
    assert_eq!(result["markets"][0]["last_error"]["code"], "worker_failed");
    assert_eq!(result["markets"][1]["attempt_state"], "not_attempted");
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    assert_eq!(calls.lock().unwrap().len(), 1);
    s.stop().await;
}

#[test]
fn every_adapter_error_has_a_safe_stable_api_code() {
    use MarketDataError::*;
    for (error, code) in [
        (UnsupportedPair, "unsupported_pair"),
        (InvalidConfiguration, "configuration_error"),
        (ClientInitialization, "configuration_error"),
        (Timeout, "provider_timeout"),
        (Transport, "provider_transport"),
        (
            RateLimited {
                status: 418,
                retry_after: Some(Duration::from_secs(0)),
            },
            "provider_rate_limited",
        ),
        (ProviderUnavailable { status: 503 }, "provider_unavailable"),
        (HttpStatus { status: 451 }, "provider_http_status"),
        (ResponseTooLarge, "provider_response_too_large"),
        (InvalidResponse, "provider_invalid_data"),
        (SymbolMismatch, "provider_invalid_data"),
        (InvalidPrice, "provider_invalid_data"),
    ] {
        assert_eq!(
            ApiError::Provider(error).envelope_value()["error"]["code"],
            code
        );
    }
}

fn install_gate(app: &App, index: usize) -> (oneshot::Receiver<()>, mpsc::SyncSender<()>) {
    let (entered, ready) = oneshot::channel();
    let (release, wait) = mpsc::sync_channel(1);
    app.worker_gates.lock().unwrap()[index] = Some(worker::TestGate {
        entered,
        release: wait,
    });
    (ready, release)
}

#[tokio::test(flavor = "current_thread")]
async fn shutdown_discards_dispatched_unstarted_batch_without_attempt_metadata() {
    let s = Harness::new(false, false).await;
    let (entered, release) = install_gate(&s.app, 0);
    let (worker, calls) = attach(&s, vec![]).await;
    let initial = s.api("GET", "/api/v1/dashboard", "").await.1;
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    s.app.stop();
    assert_eq!(decode(&read_closed(&mut socket).await).0, 503);
    assert!(s.app.state().busy);
    release.send(()).unwrap();
    settled(&s.app).await;
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["markets"],
        initial["markets"]
    );
    assert!(calls.lock().unwrap().is_empty());
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn shutdown_between_published_btc_and_eth_keeps_unstarted_eth_unchanged() {
    let s = Harness::new(true, false).await;
    let (entered, release) = install_gate(&s.app, 1);
    let (worker, calls) = attach(&s, vec![success(Pair::BtcUsdt)]).await;
    let eth = s.api("GET", "/api/v1/dashboard", "").await.1["markets"][1].clone();
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["markets"][0]["attempt_state"],
        "success"
    );
    s.app.stop();
    release.send(()).unwrap();
    settled(&s.app).await;
    assert_eq!(decode(&read_closed(&mut socket).await).0, 503);
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["markets"][1],
        eth
    );
    assert_eq!(*calls.lock().unwrap(), [Pair::BtcUsdt]);
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn closed_command_channel_fails_dispatch_without_attempts_or_cooldown() {
    let s = Harness::new(false, false).await;
    let (send, receive) = mpsc::sync_channel(1);
    drop(receive);
    {
        let mut state = s.app.state();
        state.worker_available = true;
        state.commands = Some(send);
    }
    let (status, error) = s.api("POST", "/api/v1/refresh", "{}").await;
    assert_eq!(status, 503);
    assert_eq!(error["error"]["code"], "worker_unavailable");
    {
        let snapshot = s.app.state();
        assert!(!snapshot.busy);
        assert!(snapshot.next_start.is_none());
        for market in snapshot.markets {
            assert!(market.last_attempt_at.is_none());
        }
    }
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    s.stop().await;
}

#[tokio::test(flavor = "current_thread")]
async fn initialization_pending_rejects_admission_and_factory_panic_fails_closed() {
    let s = Harness::new(false, false).await;
    let (entered, receive) = oneshot::channel();
    let (release, wait) = mpsc::sync_channel(1);
    let (worker, ready) = Worker::start(s.app.clone(), move || {
        let _ = entered.send(());
        wait.recv().unwrap();
        Err::<Script, MarketDataError>(scripted_initialization_panic())
    })
    .unwrap();
    receive.await.unwrap();
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    assert!(s.app.state().markets[0].last_attempt_at.is_none());
    release.send(()).unwrap();
    assert!(ready.await.is_err());
    assert!(worker.join().is_err());
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["service_state"],
        "failed"
    );
    assert!(
        Worker::start(s.app.clone(), || Err::<Script, _>(
            MarketDataError::ClientInitialization
        ))
        .is_err()
    );
    s.stop().await;
}

#[tokio::test(flavor = "current_thread")]
async fn published_observations_expire_without_generation_change_and_old_ids_conflict() {
    let s = Harness::new(false, false).await;
    let (worker, _calls) = attach(&s, vec![success(Pair::BtcUsdt), success(Pair::EthUsdt)]).await;
    let old = s.valuation("1", "1");
    let result = s.api("POST", "/api/v1/refresh", "{}").await.1;
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &old).await.1["error"]["code"],
        "snapshot_replaced"
    );
    s.clock.advance(60000);
    assert_eq!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["state"],
        "complete"
    );
    s.clock.advance(1);
    let dashboard = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(dashboard["snapshot_id"], result["snapshot_id"]);
    assert_eq!(dashboard["markets"][0]["state"], "stale");
    assert!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["total"]
            .is_null()
    );
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn failed_batch_keeps_safe_previous_error_labeled_only_while_attempt_loading() {
    let s = Harness::new(false, false).await;
    let fail = || Step {
        result: Err(TransportFailure::Timeout),
        ..success(Pair::BtcUsdt)
    };
    let (btc, entered, release) = blocked(success(Pair::BtcUsdt));
    let (worker, _calls) = attach(&s, vec![fail(), fail(), btc, success(Pair::EthUsdt)]).await;
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 200);
    s.clock.advance(30000);
    let mut socket = s.connect().await;
    socket
        .write_all(s.request("POST", "/api/v1/refresh", "{}").as_bytes())
        .await
        .unwrap();
    entered.await.unwrap();
    let dashboard = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(dashboard["markets"][0]["last_error_is_previous"], true);
    assert_eq!(
        dashboard["markets"][0]["last_error"]["code"],
        "provider_timeout"
    );
    assert_eq!(dashboard["markets"][1]["attempt_state"], "failed");
    release.send(()).unwrap();
    let dashboard = decode(&read_closed(&mut socket).await).1;
    assert!(dashboard["markets"][0]["last_error"].is_null());
    assert!(
        dashboard["markets"][0]
            .get("last_error_is_previous")
            .is_none()
    );
    s.stop().await;
    worker.join().unwrap();
}

fn scripted_initialization_panic() -> MarketDataError {
    panic!("scripted initialization failure")
}

#[tokio::test(flavor = "current_thread")]
async fn clock_regression_cannot_rejuvenate_observations_or_erase_cooldown() {
    let s = Harness::new(true, false).await;
    let (worker, _) = attach(&s, vec![limited(429, None)]).await;
    s.clock.advance(60001);
    assert_eq!(
        s.api("GET", "/api/v1/dashboard", "").await.1["markets"][1]["state"],
        "stale"
    );
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 200);
    s.clock.millis.store(0, Ordering::SeqCst);
    let dashboard = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(dashboard["markets"][1]["state"], "stale");
    assert_eq!(dashboard["refresh_allowed_in_ms"], "60000");
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 429);
    assert!(
        s.api("POST", "/api/v1/valuation", &s.valuation("0", "1"))
            .await
            .1["total"]
            .is_null()
    );
    s.stop().await;
    worker.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn worker_panic_after_prior_success_marks_only_started_pair_stale() {
    let s = Harness::new(false, false).await;
    let (worker, calls) = attach(
        &s,
        vec![
            success(Pair::BtcUsdt),
            success(Pair::EthUsdt),
            Step {
                panic: true,
                ..success(Pair::BtcUsdt)
            },
        ],
    )
    .await;
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 200);
    let eth = s.api("GET", "/api/v1/dashboard", "").await.1["markets"][1].clone();
    s.clock.advance(30000);
    assert_eq!(s.api("POST", "/api/v1/refresh", "{}").await.0, 503);
    assert!(worker.join().is_err());
    let result = s.api("GET", "/api/v1/dashboard", "").await.1;
    assert_eq!(result["markets"][0]["state"], "stale");
    assert_eq!(result["markets"][0]["last_error"]["code"], "worker_failed");
    assert_eq!(
        result["markets"][1]["last_attempt_at_ms"],
        eth["last_attempt_at_ms"]
    );
    assert_eq!(result["markets"][1]["attempt_state"], "success");
    assert_eq!(calls.lock().unwrap().len(), 3);
    assert!(
        s.api("POST", "/api/v1/valuation", &s.valuation("1", "1"))
            .await
            .1["total"]
            .is_null()
    );
    s.stop().await;
}
