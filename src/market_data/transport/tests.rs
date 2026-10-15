use super::*;
use reqwest::header::{CONTENT_LENGTH, HeaderMap, HeaderValue, RETRY_AFTER};
use std::io::{self, Cursor, Read};
use std::time::Duration;

fn config() -> TimeoutConfig {
    TimeoutConfig::default()
}

struct Chunks {
    remaining: usize,
    consumed: usize,
    chunk: usize,
}
impl Read for Chunks {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.remaining.min(buf.len()).min(self.chunk);
        buf[..n].fill(b'x');
        self.remaining -= n;
        self.consumed += n;
        Ok(n)
    }
}
struct Fail(io::ErrorKind);
impl Read for Fail {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        Err(io::Error::new(self.0, "sensitive-upstream-marker"))
    }
}
struct NeverRead;
impl Read for NeverRead {
    fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
        panic!("non-200 body was read")
    }
}

#[test]
fn production_requests_are_fixed_https_get_without_credentials_or_body() {
    let transport = ReqwestTransport::new(config()).unwrap();
    for (pair, symbol) in [(Pair::BtcUsdt, "BTCUSDT"), (Pair::EthUsdt, "ETHUSDT")] {
        let request = transport
            .build_request(&MarketDataRequest::new(pair, config()))
            .unwrap();
        assert_eq!(request.method(), reqwest::Method::GET);
        assert_eq!(
            request.url().as_str(),
            format!("https://data-api.binance.vision/api/v3/ticker/price?symbol={symbol}")
        );
        assert_eq!(request.url().username(), "");
        assert!(request.url().password().is_none());
        assert!(request.body().is_none());
        for header in [
            "authorization",
            "proxy-authorization",
            "cookie",
            "x-mbx-apikey",
            "accept-encoding",
        ] {
            assert!(!request.headers().contains_key(header));
        }
        assert_eq!(request.timeout(), Some(&config().request_timeout()));
    }
}

#[test]
fn actual_builder_keeps_verification_and_configured_connect_budget() {
    let debug = format!("{:?}", client_builder(config()));
    assert!(debug.contains("http1_only: true"), "{debug}");
    assert!(debug.contains("connect_timeout: 3s"), "{debug}");
    assert!(debug.contains("redirect_policy: Policy(None)"), "{debug}");
    assert!(debug.contains("tls_sni: true"), "{debug}");
    assert!(debug.contains("tls_sslkeylogfile: false"), "{debug}");
    assert!(!debug.contains("tls_danger_accept_invalid_certs: true"));
    assert!(!debug.contains("tls_danger_accept_invalid_hostnames: true"));
    assert!(!debug.contains("cookie_store: true"));
    assert!(!debug.contains("proxies:"));
}

#[test]
fn request_total_budget_preserves_valid_boundaries() {
    for (connect, total) in [
        (Duration::from_nanos(1), Duration::from_nanos(1)),
        (Duration::from_millis(1500), Duration::from_secs(10)),
        (Duration::from_secs(60), Duration::from_secs(60)),
    ] {
        let settings = TimeoutConfig::new(connect, total).unwrap();
        let transport = ReqwestTransport::new(settings).unwrap();
        let request = transport
            .build_request(&MarketDataRequest::new(Pair::BtcUsdt, settings))
            .unwrap();
        assert_eq!(request.timeout(), Some(&total));
    }
}

#[test]
fn mismatched_client_timeouts_fail_before_network() {
    let mut transport = ReqwestTransport::new(config()).unwrap();
    let other = TimeoutConfig::new(Duration::from_secs(2), Duration::from_secs(5)).unwrap();
    assert_eq!(
        transport
            .execute(&MarketDataRequest::new(Pair::BtcUsdt, other))
            .err(),
        Some(TransportFailure::InvalidConfiguration)
    );
}

#[test]
fn client_initialization_error_is_static_and_payload_free() {
    let invalid = client_builder(config()).user_agent("sensitive-upstream-marker\n");
    let error = initialize_client(invalid).unwrap_err();
    assert_eq!(
        error,
        super::super::types::MarketDataError::ClientInitialization
    );
    assert_eq!(
        error.to_string(),
        "market data client initialization failed"
    );
    assert!(!format!("{error:?}").contains("sensitive-upstream-marker"));
    assert!(std::error::Error::source(&error).is_none());
}

#[test]
fn successful_streams_accept_empty_and_exact_cap() {
    for length in [0, 1, 16_384] {
        let mut reader = Chunks {
            remaining: length,
            consumed: 0,
            chunk: 37,
        };
        let response = collect_response(200, &HeaderMap::new(), &mut reader).unwrap();
        assert_eq!(response.body.len(), length);
        assert_eq!(reader.consumed, length);
    }
}

#[test]
fn streaming_oversize_reads_only_cap_plus_one() {
    for chunk in [1, 37, usize::MAX] {
        let mut reader = Chunks {
            remaining: usize::MAX,
            consumed: 0,
            chunk,
        };
        assert_eq!(
            collect_response(200, &HeaderMap::new(), &mut reader).err(),
            Some(TransportFailure::ResponseTooLarge)
        );
        assert_eq!(reader.consumed, 16_385);
    }
}

#[test]
fn absent_or_dishonest_content_length_cannot_control_read_bound() {
    for declared in [
        None,
        Some("0"),
        Some("1"),
        Some("16384"),
        Some("999999999999999999999999"),
    ] {
        let mut headers = HeaderMap::new();
        if let Some(value) = declared {
            headers.insert(CONTENT_LENGTH, HeaderValue::from_str(value).unwrap());
        }
        let mut reader = Chunks {
            remaining: 50_000,
            consumed: 0,
            chunk: 71,
        };
        assert_eq!(
            collect_response(200, &headers, &mut reader).err(),
            Some(TransportFailure::ResponseTooLarge)
        );
        assert_eq!(reader.consumed, 16_385);
        let response = collect_response(200, &headers, &mut Cursor::new(b"short")).unwrap();
        assert_eq!(response.body, b"short");
    }
}

#[test]
fn non_200_status_does_not_read_body_even_with_dishonest_length() {
    for status in [201, 204, 301, 400, 403, 418, 429, 451, 500, 503, 599] {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("999999999"));
        let response = collect_response(status, &headers, &mut NeverRead).unwrap();
        assert_eq!(response.status, status);
        assert!(response.body.is_empty());
    }
}

#[test]
fn retry_after_bytes_are_preserved_for_existing_orchestrator() {
    for value in ["0", "120", "-1", "Wed, 21 Oct 2015 07:28:00 GMT"] {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_str(value).unwrap());
        let response = collect_response(429, &headers, &mut NeverRead).unwrap();
        assert_eq!(response.retry_after.as_deref(), Some(value.as_bytes()));
    }
    assert!(
        collect_response(418, &HeaderMap::new(), &mut NeverRead)
            .unwrap()
            .retry_after
            .is_none()
    );
}

#[test]
fn stream_timeouts_are_distinguished_from_other_read_failures() {
    for (kind, expected) in [
        (io::ErrorKind::TimedOut, TransportFailure::Timeout),
        (io::ErrorKind::ConnectionReset, TransportFailure::Transport),
        (io::ErrorKind::UnexpectedEof, TransportFailure::Transport),
        (io::ErrorKind::Other, TransportFailure::Transport),
    ] {
        assert_eq!(
            collect_response(200, &HeaderMap::new(), &mut Fail(kind)).err(),
            Some(expected)
        );
    }
}

#[test]
fn wrapped_timeout_is_classified_before_generic_io_failure() {
    let wrapped = io::Error::other(io::Error::new(
        io::ErrorKind::TimedOut,
        "sensitive-upstream-marker",
    ));
    assert_eq!(classify_failure(&wrapped), TransportFailure::Timeout);
}

#[test]
fn read_failure_discards_partial_success_body() {
    let mut reader = Cursor::new(b"partial".to_vec()).chain(Fail(io::ErrorKind::ConnectionReset));
    assert_eq!(
        collect_response(200, &HeaderMap::new(), &mut reader).err(),
        Some(TransportFailure::Transport)
    );
}

#[test]
fn transport_failure_formatting_retains_no_upstream_error() {
    let error = classify_failure(&io::Error::other("sensitive-upstream-marker"));
    assert_eq!(error, TransportFailure::Transport);
    assert!(!format!("{error:?}").contains("sensitive-upstream-marker"));
}

use super::super::{
    MarketDataAdapter,
    types::{Clock, MarketDataError, Provider},
};
use std::{
    cell::Cell,
    time::{SystemTime, UNIX_EPOCH},
};

// Test-only use of the existing transport seam. Build the real production
// request, substitute an injected reader for network execution, then use the
// same response collector as production. No new production seam is needed.
struct StreamTransport<'a> {
    production: &'a ReqwestTransport,
    status: u16,
    headers: HeaderMap,
    reader: Option<Box<dyn Read>>,
    requests: Vec<reqwest::blocking::Request>,
}
impl HttpTransport for StreamTransport<'_> {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        self.requests.push(self.production.build_request(request)?);
        let mut reader = self
            .reader
            .take()
            .expect("unexpected second transport attempt");
        collect_response(self.status, &self.headers, &mut reader)
    }
}
struct ObservationClock(Cell<usize>);
impl Clock for ObservationClock {
    fn now(&self) -> SystemTime {
        self.0.set(self.0.get() + 1);
        UNIX_EPOCH + Duration::from_secs(123)
    }
}

#[test]
fn streaming_pipeline_preserves_both_pair_observations() {
    let production = ReqwestTransport::new(config()).unwrap();
    for (input, symbol, fixture, price) in [
        (
            "BTC/USDT",
            "BTCUSDT",
            &include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/market_data/btc_ticker.json"
            ))[..],
            "65000.12",
        ),
        (
            "ETH/USDT",
            "ETHUSDT",
            &include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/market_data/eth_ticker.json"
            ))[..],
            "2500.00000001",
        ),
    ] {
        let mut body = fixture.to_vec();
        body.resize(16_384, b' ');
        let mut transport = StreamTransport {
            production: &production,
            status: 200,
            headers: HeaderMap::new(),
            reader: Some(Box::new(Cursor::new(body))),
            requests: Vec::new(),
        };
        let clock = ObservationClock(Cell::new(0));
        let result = MarketDataAdapter::new(
            &mut transport,
            &clock,
            config().connect_timeout(),
            config().request_timeout(),
        )
        .unwrap()
        .fetch_price_str(input)
        .unwrap();
        assert_eq!(result.pair, input.parse::<Pair>().unwrap());
        assert_eq!(result.price.to_string(), price);
        assert_eq!(result.provider, Provider::Binance);
        assert_eq!(result.received_at, UNIX_EPOCH + Duration::from_secs(123));
        assert_eq!(clock.0.get(), 1);
        assert_eq!(transport.requests.len(), 1);
        assert_eq!(
            transport.requests[0].url().as_str(),
            format!("https://data-api.binance.vision/api/v3/ticker/price?symbol={symbol}")
        );
        assert_eq!(transport.requests[0].method(), reqwest::Method::GET);
        assert_eq!(
            transport.requests[0].timeout(),
            Some(&config().request_timeout())
        );
    }
}

#[test]
fn streaming_pipeline_preserves_failure_precedence_without_observation_or_retry() {
    let production = ReqwestTransport::new(config()).unwrap();
    type FailureCase = (u16, Option<&'static str>, Box<dyn Read>, MarketDataError);
    let cases: Vec<FailureCase> = vec![
        (
            200,
            None,
            Box::new(Chunks {
                remaining: 50_000,
                consumed: 0,
                chunk: 37,
            }),
            MarketDataError::ResponseTooLarge,
        ),
        (
            200,
            None,
            Box::new(Cursor::new(b"partial".to_vec()).chain(Fail(io::ErrorKind::TimedOut))),
            MarketDataError::Timeout,
        ),
        (
            200,
            None,
            Box::new(Cursor::new(b"partial".to_vec()).chain(Fail(io::ErrorKind::ConnectionReset))),
            MarketDataError::Transport,
        ),
        (
            200,
            None,
            Box::new(Cursor::new(
                br#"{"symbol":"ETHUSDT","price":null}"#.to_vec(),
            )),
            MarketDataError::InvalidResponse,
        ),
        (
            200,
            None,
            Box::new(Cursor::new(
                br#"{"symbol":"ETHUSDT","price":"invalid"}"#.to_vec(),
            )),
            MarketDataError::SymbolMismatch,
        ),
        (
            200,
            None,
            Box::new(Cursor::new(br#"{"symbol":"BTCUSDT","price":"0"}"#.to_vec())),
            MarketDataError::InvalidPrice,
        ),
        (
            301,
            None,
            Box::new(NeverRead),
            MarketDataError::HttpStatus { status: 301 },
        ),
        (
            503,
            None,
            Box::new(NeverRead),
            MarketDataError::ProviderUnavailable { status: 503 },
        ),
        (
            418,
            Some("120"),
            Box::new(NeverRead),
            MarketDataError::RateLimited {
                status: 418,
                retry_after: Some(Duration::from_secs(120)),
            },
        ),
        (
            429,
            Some("0"),
            Box::new(NeverRead),
            MarketDataError::RateLimited {
                status: 429,
                retry_after: Some(Duration::ZERO),
            },
        ),
        (
            429,
            Some("Wed, 21 Oct 2015 07:28:00 GMT"),
            Box::new(NeverRead),
            MarketDataError::RateLimited {
                status: 429,
                retry_after: None,
            },
        ),
    ];
    for (status, retry_after, reader, expected) in cases {
        let mut headers = HeaderMap::new();
        // Declared length must not select an unbounded or short read path.
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("1"));
        if let Some(value) = retry_after {
            headers.insert(RETRY_AFTER, HeaderValue::from_str(value).unwrap());
        }
        let mut transport = StreamTransport {
            production: &production,
            status,
            headers,
            reader: Some(reader),
            requests: Vec::new(),
        };
        let clock = ObservationClock(Cell::new(0));
        let error = MarketDataAdapter::new(
            &mut transport,
            &clock,
            config().connect_timeout(),
            config().request_timeout(),
        )
        .unwrap()
        .fetch_price(Pair::BtcUsdt)
        .unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(transport.requests.len(), 1);
        assert!(transport.reader.is_none());
        assert_eq!(clock.0.get(), 0);
        assert!(std::error::Error::source(&error).is_none());
        assert!(!error.to_string().contains("sensitive-upstream-marker"));
        assert!(!format!("{error:?}").contains("https://"));
    }
}
