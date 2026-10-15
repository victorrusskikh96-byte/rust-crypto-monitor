use rust_crypto_monitor::market_data::{
    MarketDataAdapter,
    transport::ReqwestTransport,
    types::{Clock, MarketDataError, Pair, TimeoutConfig},
};
use std::time::{Duration, SystemTime};

struct UnusedClock;
impl Clock for UnusedClock {
    fn now(&self) -> SystemTime {
        panic!("validation failure must not sample observation time")
    }
}

#[test]
fn public_production_adapter_constructs_and_rejects_before_network() {
    let settings = TimeoutConfig::default();
    let mut transport = ReqwestTransport::new(settings).unwrap();
    let clock = UnusedClock;
    let mut adapter = MarketDataAdapter::new(
        &mut transport,
        &clock,
        settings.connect_timeout(),
        settings.request_timeout(),
    )
    .unwrap();
    assert_eq!(
        adapter.fetch_price_str("BTC/USD"),
        Err(MarketDataError::UnsupportedPair)
    );

    // Connect timeout belongs to the initialized client. A different adapter
    // configuration must fail safely before either supported pair reaches HTTP.
    let mut adapter = MarketDataAdapter::new(
        &mut transport,
        &clock,
        Duration::from_secs(1),
        Duration::from_secs(2),
    )
    .unwrap();
    for pair in [Pair::BtcUsdt, Pair::EthUsdt] {
        assert_eq!(
            adapter.fetch_price(pair),
            Err(MarketDataError::InvalidConfiguration)
        );
    }
}
