use rust_crypto_monitor::market_data::types::{
    MarketDataError as Error, Pair, Price, TimeoutConfig,
};
use std::time::Duration;

#[test]
fn pair_canonical_identity() {
    for (s, pair) in [("BTC/USDT", Pair::BtcUsdt), ("ETH/USDT", Pair::EthUsdt)] {
        assert_eq!(s.parse::<Pair>(), Ok(pair));
        assert_eq!(pair.to_string(), s);
    }
    assert_ne!(Pair::BtcUsdt, Pair::EthUsdt);
}
#[test]
fn pair_rejects_noncanonical_input() {
    for s in [
        "",
        "btc/usdt",
        "Btc/USDT",
        "BTCUSDT",
        "ETHUSDT",
        "BTC/USD",
        "SOL/USDT",
        " BTC/USDT",
        "ETH/USDT ",
        "BTC/USDT\n",
        "BTC/USDT?symbol=ETHUSDT",
        "https://example.com",
        "\u{ff22}TC/USDT",
        "BTC/USDT\0",
    ] {
        assert_eq!(s.parse::<Pair>(), Err(Error::UnsupportedPair), "{s:?}");
    }
}
#[test]
fn price_exact_normalization() {
    for (s, expected) in [
        ("65000.12000000", "65000.12"),
        ("2500.00000001", "2500.00000001"),
        ("00012.3400", "12.34"),
        ("0.00000001", "0.00000001"),
        ("100.000", "100"),
        ("0001", "1"),
        (
            "1.2345678901234567890123456789",
            "1.2345678901234567890123456789",
        ),
    ] {
        let value = s.parse::<Price>().unwrap();
        assert_eq!(value.to_string(), expected);
        assert_eq!(value.to_string().parse::<Price>(), Ok(value));
    }
    assert_eq!("1.00".parse::<Price>(), "1".parse::<Price>());
    assert_ne!(
        "1.0000000000000000000000000001".parse::<Price>().unwrap(),
        "1".parse::<Price>().unwrap()
    );
}
#[test]
fn price_precision_boundaries() {
    for s in [
        "0.0000000000000000000000000001",
        "79228162514264337593543950335",
        "7.9228162514264337593543950335",
    ] {
        assert_eq!(s.parse::<Price>().unwrap().to_string(), s);
    }
}
#[test]
fn price_rejects_nonpositive() {
    for s in ["0", "000", "0.000", "-0", "-0.0", "-1", "-0.00000001"] {
        assert_eq!(s.parse::<Price>(), Err(Error::InvalidPrice), "{s:?}");
    }
}
#[test]
fn price_strict_ascii_syntax() {
    for s in [
        "",
        ".",
        ".1",
        "1.",
        "1.2.3",
        " 1",
        "1 ",
        "1\n",
        "\t1",
        "+1",
        "1e2",
        "1E-2",
        "NaN",
        "inf",
        "Infinity",
        "1_000",
        "1,000",
        "\u{ff11}",
        "\u{661}",
        "1\0",
        "1/2",
        "secret=value",
    ] {
        assert_eq!(s.parse::<Price>(), Err(Error::InvalidPrice), "{s:?}");
    }
}
#[test]
fn price_rejects_excess_scale_even_trailing_zeros() {
    for s in [
        "0.00000000000000000000000000001",
        "1.00000000000000000000000000000",
        "0.12345678901234567890123456789",
    ] {
        assert_eq!(s.parse::<Price>(), Err(Error::InvalidPrice), "{s}");
    }
}
#[test]
fn price_rejects_coefficient_overflow_without_rounding() {
    for s in [
        "79228162514264337593543950336",
        "7.9228162514264337593543950336",
        "79228162514264337593543950335.0",
        "99999999999999999999999999999999999999999999999999",
    ] {
        assert_eq!(s.parse::<Price>(), Err(Error::InvalidPrice), "{s}");
    }
}
#[test]
fn price_byte_limit() {
    let s = format!("{}1", "0".repeat(127));
    assert_eq!(s.len(), 128);
    assert_eq!(s.parse::<Price>().unwrap().to_string(), "1");
    assert_eq!(format!("0{s}").parse::<Price>(), Err(Error::InvalidPrice));
    assert_eq!(
        "\u{ff19}".repeat(43).parse::<Price>(),
        Err(Error::InvalidPrice)
    );
}
#[test]
fn timeout_defaults() {
    let c = TimeoutConfig::default();
    assert_eq!(c.connect_timeout(), Duration::from_secs(3));
    assert_eq!(c.request_timeout(), Duration::from_secs(10));
    assert_eq!(
        TimeoutConfig::new(Duration::from_secs(3), Duration::from_secs(10)),
        Ok(c)
    );
}
#[test]
fn timeout_valid_boundaries() {
    for (connect, request) in [
        (Duration::from_nanos(1), Duration::from_nanos(1)),
        (Duration::from_secs(60), Duration::from_secs(60)),
        (Duration::from_millis(1500), Duration::from_secs(60)),
    ] {
        let c = TimeoutConfig::new(connect, request).unwrap();
        assert_eq!(c.connect_timeout(), connect);
        assert_eq!(c.request_timeout(), request);
    }
}
#[test]
fn timeout_invalid_settings() {
    for (connect, request) in [
        (Duration::ZERO, Duration::ZERO),
        (Duration::ZERO, Duration::from_secs(10)),
        (Duration::from_secs(1), Duration::ZERO),
        (Duration::from_secs(11), Duration::from_secs(10)),
        (
            Duration::from_secs(60) + Duration::from_nanos(1),
            Duration::from_secs(60),
        ),
        (
            Duration::from_secs(1),
            Duration::from_secs(60) + Duration::from_nanos(1),
        ),
        (Duration::MAX, Duration::MAX),
    ] {
        assert_eq!(
            TimeoutConfig::new(connect, request),
            Err(Error::InvalidConfiguration)
        );
    }
}
#[test]
fn errors_do_not_retain_input() {
    let pair = "secret=value".parse::<Pair>().unwrap_err();
    let price = "secret=value".parse::<Price>().unwrap_err();
    for (error, message) in [
        (pair, "unsupported market pair"),
        (price, "invalid price"),
        (Error::InvalidConfiguration, "invalid timeout configuration"),
    ] {
        let e: &dyn std::error::Error = &error;
        assert_eq!(e.to_string(), message);
        assert!(e.source().is_none());
        assert!(!format!("{error:?}").contains("secret=value"));
    }
}
