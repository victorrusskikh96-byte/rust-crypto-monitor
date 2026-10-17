use rust_crypto_monitor::{
    cli::run,
    market_data::{
        MarketDataAdapter,
        transport::{HttpTransport, MarketDataRequest, TransportFailure, TransportResponse},
        types::{Clock, MarketDataError, Pair, PriceObservation, Provider, TimeoutConfig},
    },
};
use std::{
    ffi::OsString,
    io::{self, Write},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn observation(pair: Pair, price: &str, time: SystemTime) -> PriceObservation {
    PriceObservation {
        pair,
        price: price.parse().unwrap(),
        provider: Provider::Binance,
        received_at: time,
    }
}

fn invoke(
    args: &[&str],
    fetch: impl FnOnce(Pair) -> Result<PriceObservation, MarketDataError>,
) -> (u8, String, String) {
    let mut out = Vec::new();
    let mut err = Vec::new();
    let code = run(args.iter().map(OsString::from), fetch, &mut out, &mut err);
    (
        code,
        String::from_utf8(out).unwrap(),
        String::from_utf8(err).unwrap(),
    )
}

struct FixedClock(SystemTime);
impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        self.0
    }
}

struct FakeTransport {
    response: Option<Result<TransportResponse, TransportFailure>>,
    calls: usize,
    pair: Pair,
}
impl HttpTransport for FakeTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        self.calls += 1;
        assert_eq!(request.pair(), self.pair);
        assert_eq!(request.method(), "GET");
        assert_eq!(request.host(), "data-api.binance.vision");
        self.response.take().expect("unexpected retry")
    }
}

fn fixture_success(pair: Pair, body: &[u8], price: &str) {
    let mut transport = FakeTransport {
        response: Some(Ok(TransportResponse {
            status: 200,
            retry_after: None,
            body: body.to_vec(),
        })),
        calls: 0,
        pair,
    };
    let clock = FixedClock(UNIX_EPOCH + Duration::new(1_700_000_000, 123_456_700));
    let settings = TimeoutConfig::default();
    let result = invoke(&[&pair.to_string()], |requested| {
        MarketDataAdapter::new(
            &mut transport,
            &clock,
            settings.connect_timeout(),
            settings.request_timeout(),
        )?
        .fetch_price(requested)
    });
    assert_eq!(
        result,
        (
            0,
            format!(
                "pair: {pair}\nprice: {price} USDT\nprovider: Binance\nobserved_at_unix_seconds_utc: 1700000000.123456700\n"
            ),
            String::new(),
        )
    );
    assert_eq!(transport.calls, 1);
}

#[test]
fn valid_btc_fixture_produces_exact_success_output_without_network() {
    fixture_success(
        Pair::BtcUsdt,
        include_bytes!("fixtures/market_data/btc_ticker.json"),
        "65000.12",
    );
}

#[test]
fn valid_eth_fixture_produces_exact_success_output_without_network() {
    fixture_success(
        Pair::EthUsdt,
        include_bytes!("fixtures/market_data/eth_ticker.json"),
        "2500.00000001",
    );
}

fn invalid(args: &[&str]) {
    let result = invoke(args, |_| {
        panic!("invalid arguments must not construct/fetch")
    });
    assert_eq!(
        result,
        (
            2,
            String::new(),
            "Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n".to_string(),
        )
    );
}

#[test]
fn missing_argument_rejected_before_fetch() {
    invalid(&[]);
}

#[test]
fn extra_arguments_rejected_before_fetch() {
    invalid(&["BTC/USDT", "ETH/USDT"]);
    invalid(&["BTC/USDT", ""]);
}

#[test]
fn invalid_pair_is_sanitized_and_rejected_before_fetch() {
    for input in [
        "",
        "BTC/USD",
        "btc/usdt",
        " BTC/USDT",
        "BTC/USDT ",
        "--help",
        "https://untrusted.invalid",
        "SECRET_MARKER\nspoofed output",
    ] {
        invalid(&[input]);
    }
}

#[test]
fn non_unicode_argument_rejected_before_fetch() {
    #[cfg(windows)]
    let arg = {
        use std::os::windows::ffi::OsStringExt;
        OsString::from_wide(&[0xD800])
    };
    #[cfg(unix)]
    let arg = {
        use std::os::unix::ffi::OsStringExt;
        OsString::from_vec(vec![0xff])
    };
    #[cfg(not(any(windows, unix)))]
    let arg = OsString::from("unsupported");
    let mut out = Vec::new();
    let mut err = Vec::new();
    assert_eq!(
        run([arg], |_| panic!("must not fetch"), &mut out, &mut err),
        2
    );
    assert!(out.is_empty());
    assert_eq!(err, b"Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n");
}

#[test]
fn exact_price_boundaries_and_normalization_are_not_rounded() {
    for (input, canonical) in [
        ("00012.3400", "12.34"),
        (
            "0.0000000000000000000000000001",
            "0.0000000000000000000000000001",
        ),
        (
            "79228162514264337593543950335",
            "79228162514264337593543950335",
        ),
    ] {
        let (code, out, err) = invoke(&["BTC/USDT"], |pair| {
            Ok(observation(pair, input, UNIX_EPOCH))
        });
        assert_eq!(code, 0);
        assert!(out.contains(&format!("price: {canonical} USDT\n")));
        assert!(err.is_empty());
    }
}

#[test]
fn utc_unix_timestamp_handles_epoch_fraction_and_negative_values() {
    for (time, expected) in [
        (UNIX_EPOCH, "0.000000000"),
        (UNIX_EPOCH + Duration::from_nanos(100), "0.000000100"),
        (UNIX_EPOCH - Duration::from_nanos(100), "-0.000000100"),
        (UNIX_EPOCH - Duration::new(1, 123_456_700), "-1.123456700"),
    ] {
        let (code, out, err) = invoke(&["ETH/USDT"], |pair| Ok(observation(pair, "1", time)));
        assert_eq!(code, 0);
        assert!(out.ends_with(&format!("observed_at_unix_seconds_utc: {expected}\n")));
        assert!(err.is_empty());
    }
}

#[test]
fn every_domain_error_returns_sanitized_stderr_and_failure_exit() {
    use MarketDataError::*;
    for error in [
        UnsupportedPair,
        InvalidPrice,
        InvalidConfiguration,
        ClientInitialization,
        InvalidResponse,
        SymbolMismatch,
        ResponseTooLarge,
        Timeout,
        Transport,
        RateLimited {
            status: 429,
            retry_after: Some(Duration::from_secs(120)),
        },
        ProviderUnavailable { status: 503 },
        HttpStatus { status: 451 },
    ] {
        let result = invoke(&["BTC/USDT"], |_| Err(error));
        assert_eq!(result, (3, String::new(), format!("error: {error}\n")));
    }
}

#[test]
fn adapter_transport_failures_return_nonzero_without_retry_or_default_price() {
    for failure in [
        TransportFailure::Timeout,
        TransportFailure::Transport,
        TransportFailure::ResponseTooLarge,
        TransportFailure::InvalidConfiguration,
    ] {
        let mut transport = FakeTransport {
            response: Some(Err(failure)),
            calls: 0,
            pair: Pair::BtcUsdt,
        };
        let settings = TimeoutConfig::default();
        let result = invoke(&["BTC/USDT"], |pair| {
            MarketDataAdapter::new(
                &mut transport,
                &FixedClock(UNIX_EPOCH),
                settings.connect_timeout(),
                settings.request_timeout(),
            )?
            .fetch_price(pair)
        });
        assert_eq!(result.0, 3);
        assert!(result.1.is_empty());
        assert!(result.2.starts_with("error: "));
        assert_eq!(transport.calls, 1);
    }
}

struct BrokenWriter;
impl Write for BrokenWriter {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::Error::new(io::ErrorKind::BrokenPipe, "SECRET_MARKER"))
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn stdout_failure_is_sanitized_and_does_not_refetch() {
    let mut err = Vec::new();
    let mut calls = 0;
    let code = run(
        [OsString::from("BTC/USDT")],
        |pair| {
            calls += 1;
            Ok(observation(pair, "1", UNIX_EPOCH))
        },
        &mut BrokenWriter,
        &mut err,
    );
    assert_eq!(code, 4);
    assert_eq!(calls, 1);
    assert_eq!(err, b"error: could not write output\n");
}

#[test]
fn stderr_failure_returns_output_error_without_panic_or_fetch() {
    assert_eq!(
        run(
            std::iter::empty::<OsString>(),
            |_| panic!("must not fetch"),
            &mut Vec::new(),
            &mut BrokenWriter,
        ),
        4
    );
    assert_eq!(
        run(
            [OsString::from("ETH/USDT")],
            |_| Err(MarketDataError::Timeout),
            &mut Vec::new(),
            &mut BrokenWriter,
        ),
        4
    );
}

#[test]
fn actual_executable_argument_failures_have_exit_two_and_no_success_output() {
    // Only invalid invocations: never exercise the production network path.
    for args in [vec![], vec!["BTC/USD"], vec!["BTC/USDT", "ETH/USDT"]] {
        let output = Command::new(env!("CARGO_BIN_EXE_rust-crypto-monitor"))
            .args(args)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(
            output.stderr,
            b"Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n"
        );
    }
}
