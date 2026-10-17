//! Pure two-asset valuation. No fetching, clock reads, serialization or side effects.
use crate::market_data::types::{Pair, Price, PriceObservation};
use rust_decimal::Decimal;
use std::{error::Error, fmt, str::FromStr, time::Duration};

const MAX_COEFFICIENT: u128 = (1_u128 << 96) - 1;
const FRESHNESS: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValuationError {
    InvalidQuantity,
    InvalidQuote,
    ArithmeticCapacity,
    UnrepresentableValue,
}
impl fmt::Display for ValuationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidQuantity => "invalid portfolio quantity",
            Self::InvalidQuote => "invalid portfolio quote",
            Self::ArithmeticCapacity => "portfolio arithmetic capacity exceeded",
            Self::UnrepresentableValue => "exact portfolio value is not representable",
        })
    }
}
impl Error for ValuationError {}

/// Nonnegative quantity <=1,000,000; input <=32 bytes and <=8 fractional digits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Quantity(Decimal);
impl FromStr for Quantity {
    type Err = ValuationError;
    fn from_str(input: &str) -> Result<Self, Self::Err> {
        if input.is_empty() || input.len() > 32 {
            return Err(ValuationError::InvalidQuantity);
        }
        let (integer, fraction) = match input.split_once('.') {
            Some((integer, fraction)) if !fraction.is_empty() => (integer, fraction),
            Some(_) => return Err(ValuationError::InvalidQuantity),
            None => (input, ""),
        };
        if integer.is_empty()
            || fraction.len() > 8
            || !integer
                .bytes()
                .chain(fraction.bytes())
                .all(|b| b.is_ascii_digit())
        {
            return Err(ValuationError::InvalidQuantity);
        }
        let value = Decimal::from_str_exact(input).map_err(|_| ValuationError::InvalidQuantity)?;
        if value > Decimal::from(1_000_000_u32) {
            return Err(ValuationError::InvalidQuantity);
        }
        Ok(Self(value.normalize()))
    }
}
impl fmt::Display for Quantity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0.to_string())
    }
}

/// Exact nonnegative monetary value in USDT, never USD. No mutable Decimal escapes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UsdtValue(Decimal);
impl fmt::Display for UsdtValue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Formatter precision must not hide exact financial digits.
        f.write_str(&self.0.to_string())
    }
}

/// Presentation-only hundredths of a percentage point, half-even rounded once.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AllocationPercent(u16);
impl fmt::Display for AllocationPercent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{:02}", self.0 / 100, self.0 % 100)
    }
}

/// Caller must supply monotonic age and honest last-attempt metadata.
/// received_at is retained as metadata, never used to decide freshness.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Quote {
    observation: PriceObservation,
    age: Duration,
    latest_attempt_succeeded: bool,
}
impl Quote {
    pub fn new(
        observation: PriceObservation,
        age: Duration,
        latest_attempt_succeeded: bool,
    ) -> Self {
        Self {
            observation,
            age,
            latest_attempt_succeeded,
        }
    }
    pub fn observation(&self) -> PriceObservation {
        self.observation
    }
    pub fn is_fresh(&self) -> bool {
        self.latest_attempt_succeeded && self.age <= FRESHNESS
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IncompleteReason {
    QuoteMissing,
    QuoteStale,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValuationState {
    Complete,
    Incomplete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HoldingValuation {
    pair: Pair,
    quantity: Quantity,
    quote: Option<Quote>,
    value: Option<UsdtValue>,
    reason: Option<IncompleteReason>,
    allocation: Option<AllocationPercent>,
}
impl HoldingValuation {
    pub fn pair(&self) -> Pair {
        self.pair
    }
    pub fn quantity(&self) -> Quantity {
        self.quantity
    }
    pub fn quote(&self) -> Option<Quote> {
        self.quote
    }
    pub fn value(&self) -> Option<UsdtValue> {
        self.value
    }
    pub fn reason(&self) -> Option<IncompleteReason> {
        self.reason
    }
    pub fn allocation(&self) -> Option<AllocationPercent> {
        self.allocation
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Valuation {
    btc: HoldingValuation,
    eth: HoldingValuation,
    total: Option<UsdtValue>,
}
impl Valuation {
    pub fn btc(&self) -> &HoldingValuation {
        &self.btc
    }
    pub fn eth(&self) -> &HoldingValuation {
        &self.eth
    }
    pub fn total(&self) -> Option<UsdtValue> {
        self.total
    }
    pub fn state(&self) -> ValuationState {
        if self.total.is_some() {
            ValuationState::Complete
        } else {
            ValuationState::Incomplete
        }
    }
}

/// Explicit BTC and ETH slots prevent an unbounded collection or asset framework.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Portfolio {
    btc: Quantity,
    eth: Quantity,
}
impl Portfolio {
    pub fn new(btc: Quantity, eth: Quantity) -> Self {
        Self { btc, eth }
    }
    pub fn btc(&self) -> Quantity {
        self.btc
    }
    pub fn eth(&self) -> Quantity {
        self.eth
    }

    /// Validate quote identities, compute all usable holdings, then total/allocation.
    /// Errors on usable quotes are never hidden by another missing/stale quote.
    pub fn value(
        &self,
        btc: Option<Quote>,
        eth: Option<Quote>,
    ) -> Result<Valuation, ValuationError> {
        if btc.is_some_and(|q| q.observation.pair != Pair::BtcUsdt)
            || eth.is_some_and(|q| q.observation.pair != Pair::EthUsdt)
        {
            return Err(ValuationError::InvalidQuote);
        }
        let mut btc = holding(Pair::BtcUsdt, self.btc, btc)?;
        let mut eth = holding(Pair::EthUsdt, self.eth, eth)?;
        let total = match (btc.value, eth.value) {
            (Some(btc_value), Some(eth_value)) => {
                let total = add(btc_value, eth_value)?;
                if !total.0.is_zero() {
                    btc.allocation = Some(allocate(btc_value, total)?);
                    eth.allocation = Some(allocate(eth_value, total)?);
                }
                Some(total)
            }
            _ => None,
        };
        Ok(Valuation { btc, eth, total })
    }
}

fn holding(
    pair: Pair,
    quantity: Quantity,
    quote: Option<Quote>,
) -> Result<HoldingValuation, ValuationError> {
    let (value, reason) = if quantity.0.is_zero() {
        (Some(UsdtValue(Decimal::ZERO)), None)
    } else {
        match quote {
            None => (None, Some(IncompleteReason::QuoteMissing)),
            Some(q) if !q.is_fresh() => (None, Some(IncompleteReason::QuoteStale)),
            Some(q) => (Some(multiply(quantity, q.observation.price)?), None),
        }
    };
    Ok(HoldingValuation {
        pair,
        quantity,
        quote,
        value,
        reason,
        allocation: None,
    })
}

// All callers hold private nonnegative validated wrappers. Normalize only by
// removing trailing zeros; no rounding or decimal monetary arithmetic is used.
fn parts(value: Decimal) -> (u128, u32) {
    let value = value.normalize();
    (value.mantissa().unsigned_abs(), value.scale())
}

fn exact(mut coefficient: u128, mut scale: u32) -> Result<UsdtValue, ValuationError> {
    if coefficient == 0 {
        return Ok(UsdtValue(Decimal::ZERO));
    }
    while scale > 0 && coefficient.is_multiple_of(10) {
        coefficient /= 10;
        scale -= 1;
    }
    if coefficient > MAX_COEFFICIENT || scale > 28 {
        return Err(ValuationError::UnrepresentableValue);
    }
    // The coefficient is proven <=96 bits and the scale <=28 before splitting.
    Ok(UsdtValue(Decimal::from_parts(
        coefficient as u32,
        (coefficient >> 32) as u32,
        (coefficient >> 64) as u32,
        false,
        scale,
    )))
}

fn multiply(quantity: Quantity, price: Price) -> Result<UsdtValue, ValuationError> {
    // Existing Price Display is canonical and exact. This bounded bridge keeps
    // Price's representation private and leaves the market-data core untouched.
    let price =
        Decimal::from_str_exact(&price.to_string()).map_err(|_| ValuationError::InvalidQuote)?;
    let (quantity, quantity_scale) = parts(quantity.0);
    let (price, price_scale) = parts(price);
    let product = quantity
        .checked_mul(price)
        .ok_or(ValuationError::ArithmeticCapacity)?;
    // Validated input scales are <=8 and <=28, so addition is <=36.
    exact(product, quantity_scale + price_scale)
}

fn align(value: Decimal, scale: u32) -> Result<u128, ValuationError> {
    let (coefficient, original_scale) = parts(value);
    if coefficient == 0 {
        return Ok(0);
    }
    // Only called with the maximum of the two normalized scales (both <=28).
    let factor = 10_u128
        .checked_pow(scale - original_scale)
        .ok_or(ValuationError::ArithmeticCapacity)?;
    coefficient
        .checked_mul(factor)
        .ok_or(ValuationError::ArithmeticCapacity)
}

fn aligned(a: Decimal, b: Decimal) -> Result<(u128, u128, u32), ValuationError> {
    let scale = a.scale().max(b.scale());
    Ok((align(a, scale)?, align(b, scale)?, scale))
}

fn add(a: UsdtValue, b: UsdtValue) -> Result<UsdtValue, ValuationError> {
    let (a, b, scale) = aligned(a.0, b.0)?;
    exact(
        a.checked_add(b).ok_or(ValuationError::ArithmeticCapacity)?,
        scale,
    )
}

fn allocate(value: UsdtValue, total: UsdtValue) -> Result<AllocationPercent, ValuationError> {
    // Called only for positive exact total; each nonnegative value <=total.
    let (numerator, denominator, _) = aligned(value.0, total.0)?;
    let mut digits = numerator / denominator;
    let mut remainder = numerator % denominator;
    for _ in 0..4 {
        let scaled = remainder
            .checked_mul(10)
            .ok_or(ValuationError::ArithmeticCapacity)?;
        digits = digits
            .checked_mul(10)
            .and_then(|n| n.checked_add(scaled / denominator))
            .ok_or(ValuationError::ArithmeticCapacity)?;
        remainder = scaled % denominator;
    }
    // Compare 2*remainder with denominator without doubling a large integer.
    let complement = denominator - remainder;
    if remainder > complement || (remainder == complement && digits % 2 == 1) {
        digits = digits
            .checked_add(1)
            .ok_or(ValuationError::ArithmeticCapacity)?;
    }
    Ok(AllocationPercent(
        u16::try_from(digits).map_err(|_| ValuationError::ArithmeticCapacity)?,
    ))
}
