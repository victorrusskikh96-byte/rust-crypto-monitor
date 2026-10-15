use rust_crypto_monitor::market_data::{
    MarketDataAdapter,
    transport::{HttpTransport, MarketDataRequest, TransportFailure, TransportResponse},
    types::{Clock, MarketDataError as Error, Pair, Provider},
};
use std::{
    cell::Cell,
    collections::VecDeque,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

struct FakeTransport {
    requests: Vec<MarketDataRequest>,
    script: VecDeque<Result<TransportResponse, TransportFailure>>,
}
impl FakeTransport {
    fn new(script: impl IntoIterator<Item = Result<TransportResponse, TransportFailure>>) -> Self {
        Self {
            requests: Vec::new(),
            script: script.into_iter().collect(),
        }
    }
}
impl HttpTransport for FakeTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        self.requests.push(*request);
        self.script
            .pop_front()
            .expect("unexpected transport invocation")
    }
}
struct FixedClock(Cell<usize>);
impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        self.0.set(self.0.get() + 1);
        UNIX_EPOCH + Duration::from_secs(123)
    }
}
fn response(status: u16, retry_after: Option<&[u8]>, body: &[u8]) -> TransportResponse {
    TransportResponse {
        status,
        retry_after: retry_after.map(Vec::from),
        body: body.to_vec(),
    }
}
fn valid() -> TransportResponse {
    response(
        200,
        None,
        include_bytes!("fixtures/market_data/btc_ticker.json"),
    )
}
fn fetch(
    fake: &mut FakeTransport,
    clock: &dyn Clock,
    pair: Pair,
) -> Result<rust_crypto_monitor::market_data::types::PriceObservation, Error> {
    MarketDataAdapter::new(fake, clock, Duration::from_secs(3), Duration::from_secs(10))
        .unwrap()
        .fetch_price(pair)
}
fn failure_once(script: Result<TransportResponse, TransportFailure>, expected: Error) {
    let mut fake = FakeTransport::new([script, Ok(valid())]);
    let clock = FixedClock(Cell::new(0));
    assert_eq!(fetch(&mut fake, &clock, Pair::BtcUsdt), Err(expected));
    assert_eq!(fake.requests.len(), 1);
    assert_eq!(
        fake.script.len(),
        1,
        "unexpected retry consumed success fallback"
    );
    assert_eq!(clock.0.get(), 0);
}
#[test]
fn btc_fetch_has_fixed_request_and_normalized_observation() {
    let mut fake = FakeTransport::new([Ok(valid())]);
    let clock = FixedClock(Cell::new(0));
    let observation = fetch(&mut fake, &clock, Pair::BtcUsdt).unwrap();
    assert_eq!(observation.pair, Pair::BtcUsdt);
    assert_eq!(observation.price.to_string(), "65000.12");
    assert_eq!(observation.provider, Provider::Binance);
    assert_eq!(
        observation.received_at,
        UNIX_EPOCH + Duration::from_secs(123)
    );
    assert_eq!(clock.0.get(), 1);
    assert_eq!(fake.requests.len(), 1);
    let request = fake.requests[0];
    assert_eq!(request.scheme(), "https");
    assert_eq!(request.host(), "data-api.binance.vision");
    assert_eq!(request.path(), "/api/v3/ticker/price");
    assert_eq!(request.method(), "GET");
    assert_eq!(request.pair(), Pair::BtcUsdt);
    assert_eq!(request.symbol_parameter(), ("symbol", "BTCUSDT"));
    assert_eq!(request.timeouts().connect_timeout(), Duration::from_secs(3));
    assert_eq!(
        request.timeouts().request_timeout(),
        Duration::from_secs(10)
    );
}
#[test]
fn eth_fetch_maps_symbol_and_exact_price() {
    let mut fake = FakeTransport::new([Ok(response(
        200,
        None,
        include_bytes!("fixtures/market_data/eth_ticker.json"),
    ))]);
    let clock = FixedClock(Cell::new(0));
    let result = fetch(&mut fake, &clock, Pair::EthUsdt).unwrap();
    assert_eq!(result.pair, Pair::EthUsdt);
    assert_eq!(result.price.to_string(), "2500.00000001");
    assert_eq!(result.provider, Provider::Binance);
    assert_eq!(result.received_at, UNIX_EPOCH + Duration::from_secs(123));
    assert_eq!(clock.0.get(), 1);
    assert_eq!(fake.requests.len(), 1);
    assert_eq!(fake.requests[0].symbol_parameter(), ("symbol", "ETHUSDT"));
}
#[test]
fn invalid_pair_inputs_never_invoke_transport() {
    let mut fake = FakeTransport::new([]);
    let clock = FixedClock(Cell::new(0));
    let mut adapter = MarketDataAdapter::new(
        &mut fake,
        &clock,
        Duration::from_secs(3),
        Duration::from_secs(10),
    )
    .unwrap();
    for input in [
        "",
        "btc/usdt",
        "BTCUSDT",
        "BTC/USD",
        "SOL/USDT",
        " BTC/USDT",
        "BTC/USDT?symbol=ETHUSDT",
    ] {
        assert_eq!(adapter.fetch_price_str(input), Err(Error::UnsupportedPair));
    }
    assert!(fake.requests.is_empty());
    assert_eq!(clock.0.get(), 0);
}
#[test]
fn invalid_configuration_never_invoke_transport() {
    let mut fake = FakeTransport::new([]);
    let clock = FixedClock(Cell::new(0));
    for (connect, total) in [
        (Duration::ZERO, Duration::from_secs(10)),
        (Duration::from_secs(1), Duration::ZERO),
        (Duration::from_secs(11), Duration::from_secs(10)),
        (
            Duration::from_secs(1),
            Duration::from_secs(60) + Duration::from_nanos(1),
        ),
    ] {
        assert!(matches!(
            MarketDataAdapter::new(&mut fake, &clock, connect, total),
            Err(Error::InvalidConfiguration)
        ));
    }
    assert!(fake.requests.is_empty());
    assert_eq!(clock.0.get(), 0);
}
#[test]
fn valid_timeout_boundaries_reach_transport_unchanged() {
    for (connect, total) in [
        (Duration::from_nanos(1), Duration::from_nanos(1)),
        (Duration::from_secs(60), Duration::from_secs(60)),
        (Duration::from_millis(1500), Duration::from_secs(10)),
    ] {
        let mut fake = FakeTransport::new([Ok(valid())]);
        let clock = FixedClock(Cell::new(0));
        MarketDataAdapter::new(&mut fake, &clock, connect, total)
            .unwrap()
            .fetch_price(Pair::BtcUsdt)
            .unwrap();
        assert_eq!(fake.requests.len(), 1);
        assert_eq!(fake.requests[0].timeouts().connect_timeout(), connect);
        assert_eq!(fake.requests[0].timeouts().request_timeout(), total);
    }
}
#[test]
fn transport_failures_are_typed_and_never_retried() {
    for (failure, error) in [
        (TransportFailure::Timeout, Error::Timeout),
        (TransportFailure::Transport, Error::Transport),
        (TransportFailure::ResponseTooLarge, Error::ResponseTooLarge),
    ] {
        failure_once(Err(failure), error);
    }
}
#[test]
fn non_200_status_precedes_malformed_or_oversized_body() {
    for status in [201, 204, 301, 400, 403, 451, 499] {
        for body in [&b"not JSON"[..], &vec![0xff; 16_385][..]] {
            failure_once(
                Ok(response(status, Some(b"120"), body)),
                Error::HttpStatus { status },
            );
        }
    }
}
#[test]
fn provider_unavailable_statuses_preserve_status_without_retry() {
    for status in [500, 503, 599] {
        failure_once(
            Ok(response(status, None, b"not JSON")),
            Error::ProviderUnavailable { status },
        );
    }
}
#[test]
fn rate_limits_parse_unsigned_seconds_and_do_not_retry() {
    for status in [418, 429] {
        for (header, seconds) in [
            (&b"0"[..], 0),
            (&b"120"[..], 120),
            (&b"00120"[..], 120),
            (&b"18446744073709551615"[..], u64::MAX),
        ] {
            failure_once(
                Ok(response(status, Some(header), b"malformed")),
                Error::RateLimited {
                    status,
                    retry_after: Some(Duration::from_secs(seconds)),
                },
            );
        }
    }
}
#[test]
fn invalid_retry_after_is_none_and_still_rate_limited() {
    for status in [418, 429] {
        for header in [
            None,
            Some(&b""[..]),
            Some(&b"-1"[..]),
            Some(&b"+1"[..]),
            Some(&b" 120"[..]),
            Some(&b"120 "[..]),
            Some(&b"1.5"[..]),
            Some(&b"1e2"[..]),
            Some(&b"Wed, 21 Oct 2015 07:28:00 GMT"[..]),
            Some(&b"18446744073709551616"[..]),
            Some(&b"\xff"[..]),
        ] {
            failure_once(
                Ok(response(status, header, b"bad")),
                Error::RateLimited {
                    status,
                    retry_after: None,
                },
            );
        }
    }
}
#[test]
fn zero_retry_after_does_not_consume_second_scripted_response() {
    failure_once(
        Ok(response(429, Some(b"0"), b"bad")),
        Error::RateLimited {
            status: 429,
            retry_after: Some(Duration::ZERO),
        },
    );
}
#[test]
fn successful_body_limit_is_checked_before_decoding() {
    let mut body = valid().body;
    body.resize(16_384, b' ');
    let mut fake = FakeTransport::new([Ok(response(200, None, &body))]);
    let clock = FixedClock(Cell::new(0));
    assert!(fetch(&mut fake, &clock, Pair::BtcUsdt).is_ok());
    assert_eq!(fake.requests.len(), 1);
    failure_once(
        Ok(response(200, None, &vec![0xff; 16_385])),
        Error::ResponseTooLarge,
    );
}
#[test]
fn normalization_failures_are_not_retried_or_replaced() {
    for (body, error) in [
        (&b"not JSON"[..], Error::InvalidResponse),
        (
            &br#"{"symbol":"ETHUSDT","price":"invalid"}"#[..],
            Error::SymbolMismatch,
        ),
        (
            &br#"{"symbol":"BTCUSDT","price":"0"}"#[..],
            Error::InvalidPrice,
        ),
        (
            &br#"{"symbol":"ETHUSDT","price":null}"#[..],
            Error::InvalidResponse,
        ),
    ] {
        failure_once(Ok(response(200, None, body)), error);
    }
}
#[test]
fn failure_after_success_does_not_return_stale_observation() {
    let mut fake = FakeTransport::new([Ok(valid()), Err(TransportFailure::Timeout)]);
    let clock = FixedClock(Cell::new(0));
    let mut adapter = MarketDataAdapter::new(
        &mut fake,
        &clock,
        Duration::from_secs(3),
        Duration::from_secs(10),
    )
    .unwrap();
    assert!(adapter.fetch_price(Pair::BtcUsdt).is_ok());
    assert_eq!(adapter.fetch_price(Pair::BtcUsdt), Err(Error::Timeout));
    assert_eq!(fake.requests.len(), 2);
    assert!(fake.script.is_empty());
    assert_eq!(clock.0.get(), 1);
}
#[test]
fn fetch_error_formatting_never_exposes_upstream_payload() {
    for status in [301, 403, 418, 429, 500, 503] {
        let mut fake = FakeTransport::new([Ok(response(
            status,
            Some(b"sensitive-marker"),
            b"sensitive-marker",
        ))]);
        let clock = FixedClock(Cell::new(0));
        let error = fetch(&mut fake, &clock, Pair::BtcUsdt).unwrap_err();
        assert!(!error.to_string().contains("sensitive-marker"));
        assert!(!format!("{error:?}").contains("sensitive-marker"));
        let as_error: &dyn std::error::Error = &error;
        assert!(as_error.source().is_none());
        assert_eq!(fake.requests.len(), 1);
    }
    assert_eq!(Error::Timeout.to_string(), "market data request timed out");
    assert_eq!(Error::Transport.to_string(), "market data transport failed");
}
