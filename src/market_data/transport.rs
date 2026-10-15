//! A synchronous transport seam; this module performs no network operations.
use super::types::{Pair, TimeoutConfig};

/// Internally constructed public-data request. No arbitrary URL, body or headers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MarketDataRequest {
    pair: Pair,
    timeouts: TimeoutConfig,
}
impl MarketDataRequest {
    pub(crate) fn new(pair: Pair, timeouts: TimeoutConfig) -> Self {
        Self { pair, timeouts }
    }
    pub fn scheme(&self) -> &'static str {
        "https"
    }
    pub fn host(&self) -> &'static str {
        "data-api.binance.vision"
    }
    pub fn path(&self) -> &'static str {
        "/api/v3/ticker/price"
    }
    pub fn method(&self) -> &'static str {
        "GET"
    }
    pub fn pair(&self) -> Pair {
        self.pair
    }
    pub fn symbol_parameter(&self) -> (&'static str, &'static str) {
        (
            "symbol",
            match self.pair {
                Pair::BtcUsdt => "BTCUSDT",
                Pair::EthUsdt => "ETHUSDT",
            },
        )
    }
    pub fn timeouts(&self) -> TimeoutConfig {
        self.timeouts
    }
}

/// Scriptable response envelope; deliberately has no derived payload Debug output.
/// A production transport must not read non-200 bodies and must bound successful
/// reads before buffering. Orchestration defensively checks even nonconforming
/// fake bodies; Vec here does not provide production streaming enforcement.
pub struct TransportResponse {
    pub status: u16,
    /// Raw value of Retry-After, not a prevalidated retry instruction.
    pub retry_after: Option<Vec<u8>>,
    pub body: Vec<u8>,
}

/// Transport errors carry no upstream payload, URL, credentials or diagnostics.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportFailure {
    Timeout,
    Transport,
    ResponseTooLarge,
}

/// Perform exactly one attempt. Implementations must not retry, redirect or sleep.
/// Future production implementations must classify timeouts before generic I/O
/// failures, discard non-200 bodies, and stream at most cap + 1 successful bytes.
pub trait HttpTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure>;
}
