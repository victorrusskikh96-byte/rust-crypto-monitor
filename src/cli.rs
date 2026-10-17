//! One-observation CLI boundary; production I/O is supplied only after validation.
use crate::market_data::types::{MarketDataError, Pair, PriceObservation, Provider};
use std::{ffi::OsString, io::Write, time::UNIX_EPOCH};

const USAGE: &str = "Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n";

/// Run with arguments excluding the executable name. Invalid arguments never
/// invoke fetch (including client initialization). Codes: 0 success, 2 usage,
/// 3 market-data failure, 4 output failure. Diagnostic writer failures are best effort.
pub fn run(
    args: impl IntoIterator<Item = OsString>,
    fetch: impl FnOnce(Pair) -> Result<PriceObservation, MarketDataError>,
    stdout: &mut impl Write,
    stderr: &mut impl Write,
) -> u8 {
    let mut args = args.into_iter();
    let Some(argument) = args.next() else {
        return diagnostic(stderr, USAGE, 2);
    };
    if args.next().is_some() {
        return diagnostic(stderr, USAGE, 2);
    }
    let Some(pair) = argument.to_str().and_then(|text| text.parse::<Pair>().ok()) else {
        return diagnostic(stderr, USAGE, 2);
    };
    let observation = match fetch(pair) {
        Ok(observation) => observation,
        Err(error) => return diagnostic(stderr, &format!("error: {error}\n"), 3),
    };

    let provider = match observation.provider {
        Provider::Binance => "Binance",
    };
    let (sign, since_epoch) = match observation.received_at.duration_since(UNIX_EPOCH) {
        Ok(duration) => ("", duration),
        Err(error) => ("-", error.duration()),
    };
    let output = format!(
        "pair: {}\nprice: {} USDT\nprovider: {provider}\nobserved_at_unix_seconds_utc: {sign}{}.{:09}\n",
        observation.pair,
        observation.price,
        since_epoch.as_secs(),
        since_epoch.subsec_nanos(),
    );
    if stdout
        .write_all(output.as_bytes())
        .and_then(|()| stdout.flush())
        .is_err()
    {
        return diagnostic(stderr, "error: could not write output\n", 4);
    }
    0
}

fn diagnostic(stderr: &mut impl Write, message: &str, code: u8) -> u8 {
    if stderr
        .write_all(message.as_bytes())
        .and_then(|()| stderr.flush())
        .is_err()
    {
        return 4;
    }
    code
}
