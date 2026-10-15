use rust_crypto_monitor::market_data::{
    binance::normalize_ticker,
    types::{Clock, MarketDataError as Error, Pair, PriceObservation, Provider},
};
use std::{
    cell::Cell,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

struct FixedClock {
    time: SystemTime,
    calls: Cell<usize>,
}
impl FixedClock {
    fn new() -> Self {
        Self {
            time: UNIX_EPOCH + Duration::from_secs(1_700_000_000),
            calls: Cell::new(0),
        }
    }
}
impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        self.calls.set(self.calls.get() + 1);
        self.time
    }
}
fn reject(body: &[u8], expected: Error) {
    let clock = FixedClock::new();
    assert_eq!(normalize_ticker(Pair::BtcUsdt, body, &clock), Err(expected));
    assert_eq!(clock.calls.get(), 0, "clock sampled on invalid input");
}
fn check_observation(observation: PriceObservation, pair: Pair, price: &str, clock: &FixedClock) {
    assert_eq!(observation.pair, pair);
    assert_eq!(observation.pair.to_string(), pair.to_string());
    assert_eq!(observation.price.to_string(), price);
    assert_eq!(observation.provider, Provider::Binance);
    assert_eq!(observation.received_at, clock.time);
    assert_eq!(clock.calls.get(), 1);
}
#[test]
fn btc_fixture_normalizes_identity_price_and_time() {
    let clock = FixedClock::new();
    let observation = normalize_ticker(
        Pair::BtcUsdt,
        include_bytes!("fixtures/market_data/btc_ticker.json"),
        &clock,
    )
    .unwrap();
    check_observation(observation, Pair::BtcUsdt, "65000.12", &clock);
}
#[test]
fn eth_fixture_normalizes_identity_price_and_time() {
    let clock = FixedClock::new();
    let observation = normalize_ticker(
        Pair::EthUsdt,
        include_bytes!("fixtures/market_data/eth_ticker.json"),
        &clock,
    )
    .unwrap();
    check_observation(observation, Pair::EthUsdt, "2500.00000001", &clock);
}
#[test]
fn exact_decimal_boundaries_survive_json_normalization() {
    for price in [
        "0.0000000000000000000000000001",
        "79228162514264337593543950335",
        "1.2345678901234567890123456789",
    ] {
        let clock = FixedClock::new();
        let body = format!(r#"{{"symbol":"BTCUSDT","price":"{price}"}}"#);
        check_observation(
            normalize_ticker(Pair::BtcUsdt, body.as_bytes(), &clock).unwrap(),
            Pair::BtcUsdt,
            price,
            &clock,
        );
    }
}
#[test]
fn missing_required_fields_are_invalid() {
    for body in [r#"{}"#, r#"{"symbol":"BTCUSDT"}"#, r#"{"price":"1"}"#] {
        reject(body.as_bytes(), Error::InvalidResponse);
    }
}
#[test]
fn null_and_incorrect_field_types_are_invalid() {
    for body in [
        r#"{"symbol":null,"price":"1"}"#,
        r#"{"symbol":"BTCUSDT","price":null}"#,
        r#"{"symbol":1,"price":"1"}"#,
        r#"{"symbol":true,"price":"1"}"#,
        r#"{"symbol":{},"price":"1"}"#,
        r#"{"symbol":[],"price":"1"}"#,
        r#"{"symbol":"BTCUSDT","price":1}"#,
        r#"{"symbol":"BTCUSDT","price":1.234567890123456789}"#,
        r#"{"symbol":"BTCUSDT","price":false}"#,
        r#"{"symbol":"BTCUSDT","price":{}}"#,
        r#"{"symbol":"BTCUSDT","price":[]}"#,
    ] {
        reject(body.as_bytes(), Error::InvalidResponse);
    }
}
#[test]
fn duplicate_known_fields_are_rejected_even_when_identical_or_escaped() {
    for body in [
        r#"{"symbol":"BTCUSDT","symbol":"BTCUSDT","price":"1"}"#,
        r#"{"symbol":"BTCUSDT","price":"1","price":"1"}"#,
        r#"{"symbol":"ETHUSDT","symbol":"BTCUSDT","price":"1"}"#,
        r#"{"symbol":"BTCUSDT","price":"1","pric\u0065":"2"}"#,
    ] {
        reject(body.as_bytes(), Error::InvalidResponse);
    }
}
#[test]
fn top_level_arrays_and_scalars_are_rejected() {
    for body in [
        r#"[]"#,
        r#"["BTCUSDT","1"]"#,
        r#"[{"symbol":"BTCUSDT","price":"1"}]"#,
        "null",
        "true",
        "42",
        r#""BTCUSDT""#,
    ] {
        reject(body.as_bytes(), Error::InvalidResponse);
    }
}
#[test]
fn malformed_and_trailing_json_are_rejected() {
    for body in [
        "",
        " ",
        "{",
        r#"{"symbol":"BTCUSDT","price":"1",}"#,
        r#"{"symbol":"BTCUSDT","price":"1"} {}"#,
        r#"{"symbol":"BTCUSDT","price":"1"} null"#,
        r#"{"symbol":"BTCUSDT","price":"1"} garbage"#,
        r#"{"symbol":"BTCUSDT","price":"\uD800"}"#,
    ] {
        reject(body.as_bytes(), Error::InvalidResponse);
    }
}
#[test]
fn invalid_utf8_is_rejected_in_known_and_ignored_fields() {
    for body in [
        &b"{\"symbol\":\"BTCUSDT\",\"price\":\"\xff\"}"[..],
        &b"{\"symbol\":\"BTCUSDT\",\"price\":\"1\",\"extra\":\"\xff\"}"[..],
    ] {
        reject(body, Error::InvalidResponse);
    }
}
#[test]
fn mismatched_symbols_are_rejected_before_price_validation() {
    for symbol in [
        "ETHUSDT",
        "BTC/USDT",
        "btcusdt",
        "",
        "BTCUSDT?symbol=ETHUSDT",
    ] {
        let body = format!(r#"{{"symbol":"{symbol}","price":"invalid"}}"#);
        reject(body.as_bytes(), Error::SymbolMismatch);
    }
    let clock = FixedClock::new();
    assert_eq!(
        normalize_ticker(
            Pair::EthUsdt,
            include_bytes!("fixtures/market_data/btc_ticker.json"),
            &clock
        ),
        Err(Error::SymbolMismatch)
    );
    assert_eq!(clock.calls.get(), 0);
    reject(
        br#"{"symbol":"ETHUSDT","price":null}"#,
        Error::InvalidResponse,
    );
}
#[test]
fn invalid_and_unrepresentable_price_strings_are_rejected() {
    for price in [
        "",
        "0",
        "-1",
        "+1",
        " 1",
        "1 ",
        ".1",
        "1.",
        "1e2",
        "NaN",
        "Infinity",
        "1_000",
        "1,000",
        "0.00000000000000000000000000001",
        "1.00000000000000000000000000000",
        "79228162514264337593543950336",
        "7.9228162514264337593543950336",
        "79228162514264337593543950335.0",
    ] {
        let body = format!(r#"{{"symbol":"BTCUSDT","price":"{price}"}}"#);
        reject(body.as_bytes(), Error::InvalidPrice);
    }
    let long_price = "0".repeat(128) + "1";
    reject(
        format!(r#"{{"symbol":"BTCUSDT","price":"{long_price}"}}"#).as_bytes(),
        Error::InvalidPrice,
    );
    reject(
        br#"{"symbol":"BTCUSDT","price":"\uFF11"}"#,
        Error::InvalidPrice,
    );
}
#[test]
fn additional_unknown_fields_and_trailing_whitespace_are_accepted() {
    let clock = FixedClock::new();
    let body = b" \n{\"extra\":{\"nested\":[1,true,null]},\"price\":\"00012.3400\",\"symbol\":\"BTCUSDT\",\"extra\":false} \r\n\t";
    check_observation(
        normalize_ticker(Pair::BtcUsdt, body, &clock).unwrap(),
        Pair::BtcUsdt,
        "12.34",
        &clock,
    );
}
#[test]
fn clock_value_is_local_metadata_and_may_precede_epoch() {
    let clock = FixedClock {
        time: UNIX_EPOCH - Duration::from_secs(1),
        calls: Cell::new(0),
    };
    check_observation(
        normalize_ticker(
            Pair::BtcUsdt,
            include_bytes!("fixtures/market_data/btc_ticker.json"),
            &clock,
        )
        .unwrap(),
        Pair::BtcUsdt,
        "65000.12",
        &clock,
    );
}
#[test]
fn body_cap_precedes_decoding_and_allows_exact_boundary() {
    let mut body = include_bytes!("fixtures/market_data/btc_ticker.json").to_vec();
    body.resize(16_384, b' ');
    let clock = FixedClock::new();
    assert!(normalize_ticker(Pair::BtcUsdt, &body, &clock).is_ok());
    body.push(b' ');
    reject(&body, Error::ResponseTooLarge);
    reject(&vec![0xff; 16_385], Error::ResponseTooLarge);
}
#[test]
fn normalization_errors_retain_no_raw_response() {
    for (body, expected, message) in [
        (
            &br#"{"symbol":"BTCUSDT","price":null,"extra":"sensitive-marker"}"#[..],
            Error::InvalidResponse,
            "invalid market data response",
        ),
        (
            &br#"{"symbol":"sensitive-marker","price":"1"}"#[..],
            Error::SymbolMismatch,
            "market data symbol mismatch",
        ),
        (
            &br#"{"symbol":"BTCUSDT","price":"sensitive-marker"}"#[..],
            Error::InvalidPrice,
            "invalid price",
        ),
    ] {
        let clock = FixedClock::new();
        let error = normalize_ticker(Pair::BtcUsdt, body, &clock).unwrap_err();
        assert_eq!(error, expected);
        assert_eq!(error.to_string(), message);
        assert!(!format!("{error:?}").contains("sensitive-marker"));
        let as_error: &dyn std::error::Error = &error;
        assert!(as_error.source().is_none());
    }
}
