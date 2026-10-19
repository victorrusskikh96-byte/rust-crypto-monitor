//! Fixed synthetic scenarios: no sockets, HTTP clients, files, credentials or scripts.
use super::*;
use crate::market_data::{
    transport::{HttpTransport, MarketDataRequest, TransportFailure, TransportResponse},
    types::Provider,
};

const EPOCH_MS: u64 = 1_792_195_200_000;
const STALE_AGE: Duration = Duration::from_millis(60_001);
const BTC: &[u8] = br#"{"symbol":"BTCUSDT","price":"65000.12"}"#;
const ETH: &[u8] = br#"{"symbol":"ETHUSDT","price":"2500.00000001"}"#;

/// Closed startup allowlist; no user-supplied fixture paths or destinations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FixtureScenario {
    Success,
    Partial,
    Stale,
    Timeout,
    RateLimit,
    Unavailable,
}
impl FixtureScenario {
    pub(super) fn parse(value: &std::ffi::OsStr) -> Option<Self> {
        Some(match value.to_str()? {
            "success" => Self::Success,
            "partial" => Self::Partial,
            "stale" => Self::Stale,
            "timeout" => Self::Timeout,
            "rate-limit" => Self::RateLimit,
            "unavailable" => Self::Unavailable,
            _ => return None,
        })
    }
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Partial => "partial",
            Self::Stale => "stale",
            Self::Timeout => "timeout",
            Self::RateLimit => "rate-limit",
            Self::Unavailable => "unavailable",
        }
    }
}

/// Wall labels advance from a fixed simulated epoch. Deadlines/freshness still use
/// the shared monotonic source; actual system wall time is never fixture evidence.
struct FixtureTime {
    source: Arc<dyn TimeSource>,
    start: Instant,
}
impl TimeSource for FixtureTime {
    fn now(&self) -> Instant {
        self.source.now()
    }
    fn wall_now(&self) -> SystemTime {
        let elapsed = self
            .source
            .now()
            .checked_duration_since(self.start)
            .unwrap_or_default();
        UNIX_EPOCH + Duration::from_millis(EPOCH_MS) + elapsed
    }
    fn sleep_until(&self, deadline: Instant) -> SleepFuture<'_> {
        self.source.sleep_until(deadline)
    }
}
pub(super) fn clock(source: Arc<dyn TimeSource>) -> Arc<dyn TimeSource> {
    Arc::new(FixtureTime {
        start: source.now(),
        source,
    })
}
pub(super) fn configure(app: &mut App, scenario: FixtureScenario) {
    app.fixture = Some(scenario);
    let now = app.now();
    let state = app.snapshot.get_mut().expect("new snapshot");
    state.mode = "fixture";
    if scenario == FixtureScenario::Stale {
        // Seeded synthetic history only: no simulated or actual attempt occurred.
        for (index, pair, price) in [
            (0, Pair::BtcUsdt, "65000.12"),
            (1, Pair::EthUsdt, "2500.00000001"),
        ] {
            state.markets[index].observation = Some(TimedObservation {
                observation: PriceObservation {
                    pair,
                    price: price.parse().expect("fixed validated fixture price"),
                    provider: Provider::Binance,
                    received_at: UNIX_EPOCH + Duration::from_millis(EPOCH_MS) - STALE_AGE,
                },
                received: now - STALE_AGE,
            });
        }
    }
}

/// Each admitted refresh repeats one fixed outcome per pair. No mutable script,
/// history, timer, sleep, retry or production transport reference exists here.
pub(super) struct FixtureTransport(pub(super) FixtureScenario);
impl HttpTransport for FixtureTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        let status = match (self.0, request.pair()) {
            (FixtureScenario::Success, _) | (FixtureScenario::Partial, Pair::BtcUsdt) => 200,
            (FixtureScenario::Partial | FixtureScenario::Stale | FixtureScenario::Timeout, _) => {
                return Err(TransportFailure::Timeout);
            }
            (FixtureScenario::RateLimit, _) => 429,
            (FixtureScenario::Unavailable, _) => 503,
        };
        Ok(TransportResponse {
            status,
            retry_after: (status == 429).then(|| b"120".to_vec()),
            body: if status == 200 {
                match request.pair() {
                    Pair::BtcUsdt => BTC,
                    Pair::EthUsdt => ETH,
                }
                .to_vec()
            } else {
                Vec::new()
            },
        })
    }
}
