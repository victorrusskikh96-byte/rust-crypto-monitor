use rust_crypto_monitor::{
    market_data::types::{Pair, PriceObservation, Provider},
    portfolio::{IncompleteReason, Portfolio, Quantity, Quote, ValuationError, ValuationState},
};
use rust_decimal::Decimal;
use std::time::{Duration, UNIX_EPOCH};

const MAX: &str = "79228162514264337593543950335";
const TINY: &str = "0.0000000000000000000000000001";

fn holdings(btc: &str, eth: &str) -> Portfolio {
    Portfolio::new(btc.parse().unwrap(), eth.parse().unwrap())
}
fn quote(pair: Pair, price: &str) -> Quote {
    aged_quote(pair, price, Duration::ZERO, true)
}
fn aged_quote(pair: Pair, price: &str, age: Duration, success: bool) -> Quote {
    Quote::new(
        PriceObservation {
            pair,
            price: price.parse().unwrap(),
            provider: Provider::Binance,
            received_at: UNIX_EPOCH,
        },
        age,
        success,
    )
}

#[test]
fn quantity_accepts_canonical_unsigned_zero_and_boundary_values() {
    for (input, expected) in [
        ("0", "0"),
        ("000.00000000", "0"),
        ("00012.3400", "12.34"),
        ("0.00000001", "0.00000001"),
        ("1000000", "1000000"),
        ("1000000.00000000", "1000000"),
        ("999999.99999999", "999999.99999999"),
    ] {
        assert_eq!(input.parse::<Quantity>().unwrap().to_string(), expected);
    }
    let padded = format!("{:0>32}", "1.23456789");
    assert_eq!(
        padded.parse::<Quantity>().unwrap().to_string(),
        "1.23456789"
    );
}
#[test]
fn quantity_rejects_negative_malformed_and_non_ascii_inputs() {
    for input in [
        "",
        "-1",
        "-0",
        "+1",
        " 1",
        "1 ",
        "1\n",
        ".1",
        "1.",
        "1..0",
        "1e2",
        "NaN",
        "Infinity",
        "1,000",
        "١",
        "１",
        "SECRET_MARKER\nspoof",
    ] {
        assert_eq!(
            input.parse::<Quantity>(),
            Err(ValuationError::InvalidQuantity)
        );
    }
}
#[test]
fn quantity_enforces_length_scale_and_numeric_range_before_normalization() {
    for input in [
        "0.000000001",
        "0.000000000",
        "1.000000000",
        "1000000.00000001",
        "1000001",
        MAX,
        "000000000000000000000000000000000",
    ] {
        assert_eq!(
            input.parse::<Quantity>(),
            Err(ValuationError::InvalidQuantity)
        );
    }
}
#[test]
fn btc_only_values_exactly_without_eth_quote() {
    let result = holdings("0.1", "0")
        .value(Some(quote(Pair::BtcUsdt, "65000.12")), None)
        .unwrap();
    assert_eq!(result.state(), ValuationState::Complete);
    assert_eq!(result.btc().pair(), Pair::BtcUsdt);
    assert_eq!(result.btc().quantity().to_string(), "0.1");
    assert_eq!(result.btc().value().unwrap().to_string(), "6500.012");
    assert_eq!(result.eth().value().unwrap().to_string(), "0");
    assert_eq!(result.total().unwrap().to_string(), "6500.012");
    assert_eq!(result.btc().allocation().unwrap().to_string(), "100.00");
    assert_eq!(result.eth().allocation().unwrap().to_string(), "0.00");
    assert_eq!(result.eth().reason(), None);
}
#[test]
fn eth_only_values_exactly_without_btc_quote() {
    let result = holdings("0", "2")
        .value(None, Some(quote(Pair::EthUsdt, "2500.00000001")))
        .unwrap();
    assert_eq!(result.eth().pair(), Pair::EthUsdt);
    assert_eq!(result.eth().value().unwrap().to_string(), "5000.00000002");
    assert_eq!(result.total().unwrap().to_string(), "5000.00000002");
    assert_eq!(result.btc().allocation().unwrap().to_string(), "0.00");
    assert_eq!(result.eth().allocation().unwrap().to_string(), "100.00");
}
#[test]
fn mixed_portfolio_matches_approved_exact_golden_example() {
    let result = holdings("0.1", "2")
        .value(
            Some(quote(Pair::BtcUsdt, "65000.12")),
            Some(quote(Pair::EthUsdt, "2500.00000001")),
        )
        .unwrap();
    assert_eq!(result.btc().value().unwrap().to_string(), "6500.012");
    assert_eq!(result.eth().value().unwrap().to_string(), "5000.00000002");
    assert_eq!(result.total().unwrap().to_string(), "11500.01200002");
    assert_eq!(result.btc().allocation().unwrap().to_string(), "56.52");
    assert_eq!(result.eth().allocation().unwrap().to_string(), "43.48");
    assert_eq!(
        result.btc().quote().unwrap().observation().provider,
        Provider::Binance
    );
}
#[test]
fn zero_holdings_are_complete_without_quotes_and_have_no_allocation() {
    let result = holdings("0", "0").value(None, None).unwrap();
    assert_eq!(result.state(), ValuationState::Complete);
    assert_eq!(result.total().unwrap().to_string(), "0");
    for item in [result.btc(), result.eth()] {
        assert_eq!(item.value().unwrap().to_string(), "0");
        assert_eq!(item.allocation(), None);
        assert_eq!(item.reason(), None);
    }
}
#[test]
fn zero_holdings_ignore_stale_and_extreme_prices_without_arithmetic_failure() {
    let result = holdings("0", "0")
        .value(
            Some(aged_quote(Pair::BtcUsdt, TINY, Duration::MAX, false)),
            Some(aged_quote(Pair::EthUsdt, MAX, Duration::MAX, true)),
        )
        .unwrap();
    assert_eq!(result.total().unwrap().to_string(), "0");
    assert_eq!(result.btc().reason(), None);
    assert_eq!(result.eth().reason(), None);
}
#[test]
fn very_small_holdings_reach_exact_minimum_monetary_scale() {
    let result = holdings("0.00000001", "0")
        .value(Some(quote(Pair::BtcUsdt, "0.00000000000000000001")), None)
        .unwrap();
    assert_eq!(result.total().unwrap().to_string(), TINY);
    assert_eq!(result.btc().allocation().unwrap().to_string(), "100.00");
}
#[test]
fn maximum_quantities_value_without_narrowing_input_precision() {
    let result = holdings("1000000", "999999.99999999")
        .value(
            Some(quote(Pair::BtcUsdt, "1")),
            Some(quote(Pair::EthUsdt, "1")),
        )
        .unwrap();
    assert_eq!(result.total().unwrap().to_string(), "1999999.99999999");
}
#[test]
fn missing_btc_quote_preserves_eth_value_but_withholds_total_and_allocations() {
    let result = holdings("1", "2")
        .value(None, Some(quote(Pair::EthUsdt, "3")))
        .unwrap();
    assert_eq!(result.state(), ValuationState::Incomplete);
    assert_eq!(result.btc().reason(), Some(IncompleteReason::QuoteMissing));
    assert_eq!(result.btc().value(), None);
    assert_eq!(result.eth().value().unwrap().to_string(), "6");
    assert_eq!(result.total(), None);
    assert_eq!(result.btc().allocation(), None);
    assert_eq!(result.eth().allocation(), None);
}
#[test]
fn missing_eth_quote_preserves_btc_value_but_withholds_total() {
    let result = holdings("2", "1")
        .value(Some(quote(Pair::BtcUsdt, "3")), None)
        .unwrap();
    assert_eq!(result.btc().value().unwrap().to_string(), "6");
    assert_eq!(result.eth().value(), None);
    assert_eq!(result.eth().reason(), Some(IncompleteReason::QuoteMissing));
    assert_eq!(result.total(), None);
    assert_eq!(result.btc().allocation(), None);
}
#[test]
fn both_missing_quotes_are_incomplete_for_positive_holdings() {
    let result = holdings("1", "1").value(None, None).unwrap();
    assert_eq!(result.state(), ValuationState::Incomplete);
    assert_eq!(result.btc().value(), None);
    assert_eq!(result.eth().value(), None);
    assert_eq!(result.total(), None);
}
#[test]
fn stale_btc_eth_or_both_are_excluded_from_totals() {
    for (btc_stale, eth_stale) in [(true, false), (false, true), (true, true)] {
        let result = holdings("1", "1")
            .value(
                Some(aged_quote(
                    Pair::BtcUsdt,
                    "2",
                    if btc_stale {
                        Duration::from_secs(61)
                    } else {
                        Duration::ZERO
                    },
                    true,
                )),
                Some(aged_quote(
                    Pair::EthUsdt,
                    "3",
                    if eth_stale {
                        Duration::from_secs(61)
                    } else {
                        Duration::ZERO
                    },
                    true,
                )),
            )
            .unwrap();
        assert_eq!(result.total(), None);
        assert_eq!(
            result.btc().reason(),
            btc_stale.then_some(IncompleteReason::QuoteStale)
        );
        assert_eq!(
            result.eth().reason(),
            eth_stale.then_some(IncompleteReason::QuoteStale)
        );
        assert_eq!(result.btc().allocation(), None);
        assert_eq!(result.eth().allocation(), None);
    }
}
#[test]
fn freshness_uses_supplied_monotonic_age_with_exact_ttl_boundary() {
    for (age, fresh) in [
        (Duration::from_secs(60), true),
        (Duration::from_secs(60) + Duration::from_nanos(1), false),
    ] {
        let q = aged_quote(Pair::BtcUsdt, "1", age, true);
        assert_eq!(q.is_fresh(), fresh);
        // A 1970 wall observation time is deliberately unrelated to supplied age.
        let result = holdings("1", "0").value(Some(q), None).unwrap();
        assert_eq!(result.total().is_some(), fresh);
    }
}
#[test]
fn failed_latest_attempt_makes_retained_observation_stale_immediately() {
    let result = holdings("1", "0")
        .value(
            Some(aged_quote(Pair::BtcUsdt, "1", Duration::ZERO, false)),
            None,
        )
        .unwrap();
    assert_eq!(result.btc().reason(), Some(IncompleteReason::QuoteStale));
    assert_eq!(
        result
            .btc()
            .quote()
            .unwrap()
            .observation()
            .price
            .to_string(),
        "1"
    );
    assert_eq!(result.btc().value(), None);
    assert_eq!(result.total(), None);
}
#[test]
fn wrong_quote_pairs_are_rejected_even_for_zero_holdings() {
    assert_eq!(
        holdings("0", "0").value(Some(quote(Pair::EthUsdt, "1")), None),
        Err(ValuationError::InvalidQuote)
    );
    assert_eq!(
        holdings("0", "0").value(None, Some(quote(Pair::BtcUsdt, "1"))),
        Err(ValuationError::InvalidQuote)
    );
}
#[test]
fn exact_product_rejects_underflow_that_decimal_checked_mul_rounds_to_zero() {
    let tiny = Decimal::from_str_exact(TINY).unwrap();
    let quantity = Decimal::from_str_exact("0.00000001").unwrap();
    assert_eq!(tiny.checked_mul(quantity), Some(Decimal::ZERO));
    assert_eq!(
        holdings("0.00000001", "0").value(Some(quote(Pair::BtcUsdt, TINY)), None),
        Err(ValuationError::UnrepresentableValue)
    );
}
#[test]
fn exact_product_rejects_coefficient_rounding_despite_checked_mul_success() {
    let price = "7.9228162514264337593543950335";
    assert!(
        Decimal::from_str_exact(price)
            .unwrap()
            .checked_mul(Decimal::from_str_exact("1.00000001").unwrap())
            .is_some()
    );
    assert_eq!(
        holdings("1.00000001", "0").value(Some(quote(Pair::BtcUsdt, price)), None),
        Err(ValuationError::UnrepresentableValue)
    );
}
#[test]
fn exact_trailing_zero_reduction_rescues_combined_scale_and_coefficient() {
    let result = holdings("0.00000002", "0")
        .value(Some(quote(Pair::BtcUsdt, "0.000000000000000000005")), None)
        .unwrap();
    assert_eq!(result.total().unwrap().to_string(), TINY);
    let result = holdings("10", "0")
        .value(
            Some(quote(Pair::BtcUsdt, "7.9228162514264337593543950335")),
            None,
        )
        .unwrap();
    assert_eq!(
        result.total().unwrap().to_string(),
        "79.228162514264337593543950335"
    );
}
#[test]
fn product_intermediate_overflow_is_distinct_from_final_representation_failure() {
    assert_eq!(
        holdings("999999.99999999", "0").value(Some(quote(Pair::BtcUsdt, MAX)), None),
        Err(ValuationError::ArithmeticCapacity)
    );
    assert_eq!(
        holdings("2", "0").value(Some(quote(Pair::BtcUsdt, MAX)), None),
        Err(ValuationError::UnrepresentableValue)
    );
}
#[test]
fn total_overflow_is_not_rounded_or_saturated() {
    assert_eq!(
        holdings("1", "1").value(
            Some(quote(Pair::BtcUsdt, MAX)),
            Some(quote(Pair::EthUsdt, "1"))
        ),
        Err(ValuationError::UnrepresentableValue)
    );
    // Checked Decimal addition may return a rounded value despite success.
    assert_eq!(
        Decimal::MAX.checked_add(Decimal::from_str_exact("0.1").unwrap()),
        Some(Decimal::MAX)
    );
    assert_eq!(
        holdings("1", "1").value(
            Some(quote(Pair::BtcUsdt, MAX)),
            Some(quote(Pair::EthUsdt, "0.1"))
        ),
        Err(ValuationError::UnrepresentableValue)
    );
}
#[test]
fn scale_alignment_overflow_returns_capacity_error() {
    assert_eq!(
        holdings("1", "1").value(
            Some(quote(Pair::BtcUsdt, MAX)),
            Some(quote(Pair::EthUsdt, TINY))
        ),
        Err(ValuationError::ArithmeticCapacity)
    );
}
#[test]
fn allocation_rounds_half_even_ties_from_exact_ratios_only_once() {
    for (btc_price, eth_price, btc_pct, eth_pct) in [
        ("1", "19999", "0.00", "100.00"),
        ("3", "19997", "0.02", "99.98"),
        ("19999", "1", "100.00", "0.00"),
    ] {
        let result = holdings("1", "1")
            .value(
                Some(quote(Pair::BtcUsdt, btc_price)),
                Some(quote(Pair::EthUsdt, eth_price)),
            )
            .unwrap();
        assert_eq!(result.btc().allocation().unwrap().to_string(), btc_pct);
        assert_eq!(result.eth().allocation().unwrap().to_string(), eth_pct);
        assert_eq!(result.total().unwrap().to_string(), "20000");
    }
}
#[test]
fn repeating_allocations_are_display_rounding_not_rounded_holdings() {
    let result = holdings("1", "1")
        .value(
            Some(quote(Pair::BtcUsdt, "1")),
            Some(quote(Pair::EthUsdt, "2")),
        )
        .unwrap();
    assert_eq!(result.btc().allocation().unwrap().to_string(), "33.33");
    assert_eq!(result.eth().allocation().unwrap().to_string(), "66.67");
    assert_eq!(result.total().unwrap().to_string(), "3");
}
#[test]
fn extreme_valid_values_allocate_without_decimal_division_or_money_rounding() {
    let result = holdings("1", "0")
        .value(Some(quote(Pair::BtcUsdt, MAX)), None)
        .unwrap();
    assert_eq!(result.total().unwrap().to_string(), MAX);
    assert_eq!(result.btc().allocation().unwrap().to_string(), "100.00");
    let half = "39614081257132168796771975167";
    let result = holdings("1", "1")
        .value(
            Some(quote(Pair::BtcUsdt, half)),
            Some(quote(Pair::EthUsdt, half)),
        )
        .unwrap();
    assert_eq!(
        result.total().unwrap().to_string(),
        "79228162514264337593543950334"
    );
    assert_eq!(result.btc().allocation().unwrap().to_string(), "50.00");
}
#[test]
fn format_precision_cannot_hide_monetary_digits_or_quantity_digits() {
    let portfolio = holdings("0.12345678", "0");
    assert_eq!(format!("{:.2}", portfolio.btc()), "0.12345678");
    let result = portfolio
        .value(Some(quote(Pair::BtcUsdt, "1")), None)
        .unwrap();
    assert_eq!(format!("{:.2}", result.total().unwrap()), "0.12345678");
    assert_eq!(
        format!("{:.0}", result.btc().allocation().unwrap()),
        "100.00"
    );
}
#[test]
fn arithmetic_failure_on_usable_quote_is_not_hidden_by_missing_other_quote() {
    assert_eq!(
        holdings("2", "1").value(Some(quote(Pair::BtcUsdt, MAX)), None),
        Err(ValuationError::UnrepresentableValue)
    );
    assert_eq!(
        holdings("1", "2").value(None, Some(quote(Pair::EthUsdt, MAX))),
        Err(ValuationError::UnrepresentableValue)
    );
}
#[test]
fn typed_errors_have_static_payload_free_messages() {
    for (error, expected) in [
        (
            ValuationError::InvalidQuantity,
            "invalid portfolio quantity",
        ),
        (ValuationError::InvalidQuote, "invalid portfolio quote"),
        (
            ValuationError::ArithmeticCapacity,
            "portfolio arithmetic capacity exceeded",
        ),
        (
            ValuationError::UnrepresentableValue,
            "exact portfolio value is not representable",
        ),
    ] {
        assert_eq!(error.to_string(), expected);
        assert!(std::error::Error::source(&error).is_none());
    }
}
#[test]
fn deterministic_integer_reference_sweep_checks_totals_and_allocation_consistency() {
    for btc in 0_u64..=9 {
        for eth in 0_u64..=9 {
            let result = holdings(&btc.to_string(), &eth.to_string())
                .value(
                    Some(quote(Pair::BtcUsdt, "2")),
                    Some(quote(Pair::EthUsdt, "3")),
                )
                .unwrap();
            let total = btc * 2 + eth * 3;
            assert_eq!(result.total().unwrap().to_string(), total.to_string());
            if total == 0 {
                assert_eq!(result.btc().allocation(), None);
                continue;
            }
            let numerator = btc * 2 * 10000;
            let floor = numerator / total;
            let remainder = numerator % total;
            let rounded = floor
                + u64::from(remainder * 2 > total || (remainder * 2 == total && floor % 2 == 1));
            let btc_allocation = result
                .btc()
                .allocation()
                .unwrap()
                .to_string()
                .replace('.', "")
                .parse::<u64>()
                .unwrap();
            let eth_allocation = result
                .eth()
                .allocation()
                .unwrap()
                .to_string()
                .replace('.', "")
                .parse::<u64>()
                .unwrap();
            assert_eq!(btc_allocation, rounded);
            assert_eq!(btc_allocation + eth_allocation, 10000);
        }
    }
}

#[test]
fn conservative_capacity_error_can_reject_a_mathematically_representable_product() {
    // 5^19 / 10^8 times (2^19 * (10^23 + 1)) / 10^20
    // equals (10^23 + 1) / 10^9 exactly, but the raw product exceeds u128.
    let coefficient = (1_u128 << 19) * (10_u128.pow(23) + 1);
    let price = Decimal::from_i128_with_scale(coefficient as i128, 20).to_string();
    assert!(5_u128.pow(19).checked_mul(coefficient).is_none());
    assert!(Decimal::from_str_exact("100000000000000.000000001").is_ok());
    assert_eq!(
        holdings("190734.86328125", "0").value(Some(quote(Pair::BtcUsdt, &price)), None),
        Err(ValuationError::ArithmeticCapacity)
    );
}

#[test]
fn allocation_values_immediately_around_a_tie_do_not_double_round() {
    for (btc, eth, expected_btc, expected_eth) in [
        (
            "0.0000499999999999999999999999",
            "0.9999500000000000000000000001",
            "0.00",
            "100.00",
        ),
        (
            "0.0000500000000000000000000001",
            "0.9999499999999999999999999999",
            "0.01",
            "99.99",
        ),
    ] {
        let result = holdings("1", "1")
            .value(
                Some(quote(Pair::BtcUsdt, btc)),
                Some(quote(Pair::EthUsdt, eth)),
            )
            .unwrap();
        assert_eq!(result.total().unwrap().to_string(), "1");
        assert_eq!(result.btc().allocation().unwrap().to_string(), expected_btc);
        assert_eq!(result.eth().allocation().unwrap().to_string(), expected_eth);
    }
}
