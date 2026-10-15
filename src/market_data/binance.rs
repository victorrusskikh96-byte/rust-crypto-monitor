//! Offline normalization of Binance symbol price ticker bodies.
use super::types::{Clock, MarketDataError, Pair, PriceObservation, Provider};
use serde::Deserialize;

pub(crate) const MAX_RESPONSE_BYTES: usize = 16_384;

// Deserialize directly from JSON into this DTO. A Value/map intermediate would
// discard duplicate keys before derive could reject duplicate known fields.
#[derive(Deserialize)]
struct TickerResponse {
    symbol: String,
    price: String,
}

/// Normalize a successful ticker response body without performing any I/O.
///
/// The future fetch layer must check HTTP status and bound reads while streaming.
/// This byte-slice cap is defense in depth, not a substitute for bounded reads.
/// The clock is sampled once, after validation, for local observation metadata.
pub fn normalize_ticker(
    requested_pair: Pair,
    body: &[u8],
    clock: &dyn Clock,
) -> Result<PriceObservation, MarketDataError> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(MarketDataError::ResponseTooLarge);
    }
    // Validate the entire body, including strings in ignored unknown fields.
    let text = std::str::from_utf8(body).map_err(|_| MarketDataError::InvalidResponse)?;
    // Derived struct visitors may also accept a positional sequence. The endpoint
    // contract requires an object; leave all remaining syntax to the JSON parser.
    if !text
        .trim_start_matches([' ', '\t', '\r', '\n'])
        .starts_with('{')
    {
        return Err(MarketDataError::InvalidResponse);
    }
    // from_slice checks the end of input, permitting only trailing JSON whitespace.
    // The DTO requires strings and rejects duplicate known fields; unknown fields
    // are ignored. Discard parser diagnostics so errors never retain raw payloads.
    let response: TickerResponse =
        serde_json::from_slice(body).map_err(|_| MarketDataError::InvalidResponse)?;
    let expected_symbol = match requested_pair {
        Pair::BtcUsdt => "BTCUSDT",
        Pair::EthUsdt => "ETHUSDT",
    };
    if response.symbol != expected_symbol {
        return Err(MarketDataError::SymbolMismatch);
    }
    let price = response.price.parse()?;
    Ok(PriceObservation {
        pair: requested_pair,
        price,
        provider: Provider::Binance,
        received_at: clock.now(),
    })
}
