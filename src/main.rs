use rust_crypto_monitor::{
    cli,
    market_data::{
        MarketDataAdapter,
        transport::ReqwestTransport,
        types::{Clock, MarketDataError, Pair, PriceObservation, TimeoutConfig},
    },
};
use std::{io, process::ExitCode, time::SystemTime};

struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}

fn fetch_production(pair: Pair) -> Result<PriceObservation, MarketDataError> {
    let settings = TimeoutConfig::default();
    let mut transport = ReqwestTransport::new(settings)?;
    MarketDataAdapter::new(
        &mut transport,
        &SystemClock,
        settings.connect_timeout(),
        settings.request_timeout(),
    )?
    .fetch_price(pair)
}

fn main() -> ExitCode {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if arguments.len() == 1 && arguments[0] == "--serve" {
        return match rust_crypto_monitor::http::run() {
            Ok(()) => ExitCode::SUCCESS,
            Err(_) => {
                use std::io::Write;
                let _ = writeln!(io::stderr().lock(), "error: local API server failed");
                ExitCode::from(3)
            }
        };
    }
    ExitCode::from(cli::run(
        arguments,
        fetch_production,
        &mut io::stdout().lock(),
        &mut io::stderr().lock(),
    ))
}
