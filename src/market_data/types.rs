//! Validated domain values. Provider symbols and HTTP details belong elsewhere.
use rust_decimal::Decimal;
use std::{
    error::Error,
    fmt,
    str::FromStr,
    time::{Duration, SystemTime},
};

/// Market data failures; no input or upstream payload is retained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketDataError {
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
        status: u16,
        retry_after: Option<Duration>,
    },
    ProviderUnavailable {
        status: u16,
    },
    HttpStatus {
        status: u16,
    },
}

impl fmt::Display for MarketDataError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::UnsupportedPair => "unsupported market pair",
            Self::InvalidPrice => "invalid price",
            Self::InvalidConfiguration => "invalid timeout configuration",
            Self::InvalidResponse => "invalid market data response",
            Self::SymbolMismatch => "market data symbol mismatch",
            Self::ResponseTooLarge => "market data response too large",
            Self::ClientInitialization => "market data client initialization failed",
            Self::Timeout => "market data request timed out",
            Self::Transport => "market data transport failed",
            Self::RateLimited { .. } => "market data rate limited",
            Self::ProviderUnavailable { .. } => "market data provider unavailable",
            Self::HttpStatus { .. } => "unexpected market data HTTP status",
        })
    }
}

impl Error for MarketDataError {}

/// Supported market identities, independent of any provider's symbol encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Pair {
    BtcUsdt,
    EthUsdt,
}

impl FromStr for Pair {
    type Err = MarketDataError;

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        match input {
            "BTC/USDT" => Ok(Self::BtcUsdt),
            "ETH/USDT" => Ok(Self::EthUsdt),
            _ => Err(MarketDataError::UnsupportedPair),
        }
    }
}

impl fmt::Display for Pair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::BtcUsdt => "BTC/USDT",
            Self::EthUsdt => "ETH/USDT",
        })
    }
}

/// A positive exact decimal with at most 28 fractional digits and a 96-bit coefficient.
/// Construction is restricted to validated decimal text; the numeric value is private.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Price(Decimal);

impl FromStr for Price {
    type Err = MarketDataError;

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        if input.is_empty() || input.len() > 128 {
            return Err(MarketDataError::InvalidPrice);
        }
        let (integer, fraction) = match input.split_once('.') {
            Some((integer, fraction)) if !fraction.is_empty() => (integer, fraction),
            Some(_) => return Err(MarketDataError::InvalidPrice),
            None => (input, ""),
        };
        if integer.is_empty()
            || fraction.len() > 28
            || !integer
                .bytes()
                .chain(fraction.bytes())
                .all(|b| b.is_ascii_digit())
        {
            return Err(MarketDataError::InvalidPrice);
        }

        // Reject the original coefficient even if dropping fractional digits could
        // make it representable. This prevents a parser from silently rounding or
        // reducing an overflowing coefficient (including trailing fractional zeros).
        let mut coefficient = 0_u128;
        const MAX_COEFFICIENT: u128 = (1_u128 << 96) - 1;
        for digit in integer.bytes().chain(fraction.bytes()) {
            // The previous iteration bounds the accumulator to 96 bits, so this
            // multiply/add cannot overflow u128.
            coefficient = coefficient * 10 + u128::from(digit - b'0');
            if coefficient > MAX_COEFFICIENT {
                return Err(MarketDataError::InvalidPrice);
            }
        }
        let decimal = Decimal::from_str_exact(input).map_err(|_| MarketDataError::InvalidPrice)?;
        if decimal <= Decimal::ZERO {
            return Err(MarketDataError::InvalidPrice);
        }
        Ok(Self(decimal.normalize()))
    }
}

impl fmt::Display for Price {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Use the decimal's plain canonical text, independent of formatter precision.
        f.write_str(&self.0.to_string())
    }
}

/// Positive connection and total HTTP request budgets, validated before transport.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeoutConfig {
    connect_timeout: Duration,
    request_timeout: Duration,
}

impl TimeoutConfig {
    pub fn new(
        connect_timeout: Duration,
        request_timeout: Duration,
    ) -> Result<Self, MarketDataError> {
        if connect_timeout.is_zero()
            || request_timeout.is_zero()
            || connect_timeout > request_timeout
            || request_timeout > Duration::from_secs(60)
        {
            return Err(MarketDataError::InvalidConfiguration);
        }
        Ok(Self {
            connect_timeout,
            request_timeout,
        })
    }

    pub fn connect_timeout(&self) -> Duration {
        self.connect_timeout
    }

    pub fn request_timeout(&self) -> Duration {
        self.request_timeout
    }
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(3),
            request_timeout: Duration::from_secs(10),
        }
    }
}

/// Identity of the market data source, independent of its response schema.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Binance,
}

/// Supplies local observation metadata; never exchange event time or a deadline.
pub trait Clock {
    fn now(&self) -> SystemTime;
}

/// A validated price in USDT per base unit, tagged with local observation time.
/// received_at may be skewed or move backward and does not prove data freshness.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PriceObservation {
    pub pair: Pair,
    pub price: Price,
    pub provider: Provider,
    pub received_at: SystemTime,
}
