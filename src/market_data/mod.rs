//! Market data domain, offline normalization, and single-attempt orchestration.
pub mod binance;
pub mod transport;
pub mod types;

use std::time::Duration;
use transport::{HttpTransport, MarketDataRequest, TransportFailure};
use types::{Clock, MarketDataError, Pair, PriceObservation, TimeoutConfig};

/// Single-attempt orchestration over caller-supplied transport and observation time.
pub struct MarketDataAdapter<'a> {
    transport: &'a mut dyn HttpTransport,
    clock: &'a dyn Clock,
    timeouts: TimeoutConfig,
}
impl<'a> MarketDataAdapter<'a> {
    pub fn new(
        transport: &'a mut dyn HttpTransport,
        clock: &'a dyn Clock,
        connect_timeout: Duration,
        request_timeout: Duration,
    ) -> Result<Self, MarketDataError> {
        let timeouts = TimeoutConfig::new(connect_timeout, request_timeout)?;
        Ok(Self {
            transport,
            clock,
            timeouts,
        })
    }
    pub fn fetch_price_str(&mut self, input: &str) -> Result<PriceObservation, MarketDataError> {
        self.fetch_price(input.parse()?)
    }
    /// Make one transport invocation; status errors never inspect or decode the body.
    pub fn fetch_price(&mut self, pair: Pair) -> Result<PriceObservation, MarketDataError> {
        let request = MarketDataRequest::new(pair, self.timeouts);
        let response = self
            .transport
            .execute(&request)
            .map_err(|failure| match failure {
                TransportFailure::InvalidConfiguration => MarketDataError::InvalidConfiguration,
                TransportFailure::Timeout => MarketDataError::Timeout,
                TransportFailure::Transport => MarketDataError::Transport,
                TransportFailure::ResponseTooLarge => MarketDataError::ResponseTooLarge,
            })?;
        match response.status {
            200 => {
                if response.body.len() > binance::MAX_RESPONSE_BYTES {
                    return Err(MarketDataError::ResponseTooLarge);
                }
                binance::normalize_ticker(pair, &response.body, self.clock)
            }
            status @ (418 | 429) => Err(MarketDataError::RateLimited {
                status,
                retry_after: parse_retry_after(response.retry_after.as_deref()),
            }),
            status @ 500..=599 => Err(MarketDataError::ProviderUnavailable { status }),
            status => Err(MarketDataError::HttpStatus { status }),
        }
    }
}

// Binance defines Retry-After as integer seconds. Reject alternate formats and
// overflow rather than guessing. None and zero do not grant caller retry permission.
fn parse_retry_after(value: Option<&[u8]>) -> Option<Duration> {
    let bytes = value?;
    if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let seconds = std::str::from_utf8(bytes).ok()?.parse::<u64>().ok()?;
    Some(Duration::from_secs(seconds))
}
