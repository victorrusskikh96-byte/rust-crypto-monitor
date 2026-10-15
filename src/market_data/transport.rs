//! Synchronous HTTP contract and fixed-destination production transport.
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
/// Production transport must not read non-200 bodies and must bound successful
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
    InvalidConfiguration,
}

/// Perform exactly one attempt. Implementations must not retry, redirect or sleep.
/// Production implementations must classify timeouts before generic I/O
/// failures, discard non-200 bodies, and stream at most cap + 1 successful bytes.
pub trait HttpTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure>;
}

#[cfg(test)]
mod tests;

/// Fixed-destination blocking HTTP transport. Construct once and reuse from a
/// synchronous caller, outside any async runtime. No request is sent by new().
///
/// Connection pooling is disabled to prevent Hyper's separate stale-connection
/// retry path. The initialized client and its internal runtime are still reused.
pub struct ReqwestTransport {
    client: reqwest::blocking::Client,
    timeouts: TimeoutConfig,
}

impl ReqwestTransport {
    pub fn new(timeouts: TimeoutConfig) -> Result<Self, super::types::MarketDataError> {
        Ok(Self {
            client: initialize_client(client_builder(timeouts))?,
            timeouts,
        })
    }

    fn build_request(
        &self,
        request: &MarketDataRequest,
    ) -> Result<reqwest::blocking::Request, TransportFailure> {
        // Connect timeout is client-wide. Never silently use a different budget
        // from the adapter's validated request contract.
        if request.timeouts() != self.timeouts {
            return Err(TransportFailure::InvalidConfiguration);
        }
        let mut url = reqwest::Url::parse("https://data-api.binance.vision/api/v3/ticker/price")
            .map_err(|_| TransportFailure::Transport)?;
        let (key, value) = request.symbol_parameter();
        url.query_pairs_mut().append_pair(key, value);
        self.client
            .get(url)
            // This populates the underlying async request's total timeout as well
            // as the blocking wait. ClientBuilder::timeout alone does not do so.
            // Reqwest carries the same deadline from headers into the body.
            .timeout(self.timeouts.request_timeout())
            .build()
            .map_err(|error| classify_failure(&error))
    }
}

fn client_builder(timeouts: TimeoutConfig) -> reqwest::blocking::ClientBuilder {
    reqwest::blocking::Client::builder()
        .https_only(true)
        .http1_only()
        .tls_backend_rustls()
        .tls_danger_accept_invalid_certs(false)
        .tls_danger_accept_invalid_hostnames(false)
        .tls_sni(true)
        .tls_sslkeylogfile(false)
        .tls_version_min(reqwest::tls::Version::TLS_1_2)
        .redirect(reqwest::redirect::Policy::none())
        .referer(false)
        .no_proxy()
        .retry(reqwest::retry::never())
        .pool_max_idle_per_host(0)
        .no_gzip()
        .no_brotli()
        .no_zstd()
        .no_deflate()
        .connect_timeout(timeouts.connect_timeout())
        .timeout(timeouts.request_timeout())
    // Cookie support is excluded from Cargo features; no cookie store, client
    // identity, default auth headers, or custom root certificates are installed.
}

fn initialize_client(
    builder: reqwest::blocking::ClientBuilder,
) -> Result<reqwest::blocking::Client, super::types::MarketDataError> {
    builder
        .build()
        .map_err(|_| super::types::MarketDataError::ClientInitialization)
}

impl HttpTransport for ReqwestTransport {
    fn execute(
        &mut self,
        request: &MarketDataRequest,
    ) -> Result<TransportResponse, TransportFailure> {
        let request = self.build_request(request)?;
        let mut response = self
            .client
            .execute(request)
            .map_err(|error| classify_failure(&error))?;
        let status = response.status().as_u16();
        // Only copy the relevant metadata. Never consume a non-200 body.
        let mut headers = reqwest::header::HeaderMap::new();
        if matches!(status, 418 | 429)
            && let Some(value) = response.headers().get(reqwest::header::RETRY_AFTER)
        {
            headers.insert(reqwest::header::RETRY_AFTER, value.clone());
        }
        collect_response(status, &headers, &mut response)
    }
}

fn collect_response(
    status: u16,
    headers: &reqwest::header::HeaderMap,
    reader: &mut impl std::io::Read,
) -> Result<TransportResponse, TransportFailure> {
    let retry_after = if matches!(status, 418 | 429) {
        headers
            .get(reqwest::header::RETRY_AFTER)
            .map(|value| value.as_bytes().to_vec())
    } else {
        None
    };
    let mut body = Vec::new();
    if status == 200 {
        // Content-Length is deliberately not used for allocation or termination.
        // Take bounds every reader call before any bytes are buffered.
        use std::io::Read;
        let limit = super::binance::MAX_RESPONSE_BYTES + 1;
        let mut limited = reader.take(limit as u64);
        let mut chunk = [0_u8; 1024];
        loop {
            let count = limited
                .read(&mut chunk)
                .map_err(|error| classify_failure(&error))?;
            if count == 0 {
                break;
            }
            body.extend_from_slice(&chunk[..count]);
            if body.len() > super::binance::MAX_RESPONSE_BYTES {
                return Err(TransportFailure::ResponseTooLarge);
            }
        }
    }
    Ok(TransportResponse {
        status,
        retry_after,
        body,
    })
}

fn classify_failure(error: &(dyn std::error::Error + 'static)) -> TransportFailure {
    let mut current = Some(error);
    while let Some(cause) = current {
        if let Some(error) = cause.downcast_ref::<reqwest::Error>()
            && error.is_timeout()
        {
            return TransportFailure::Timeout;
        }
        if let Some(error) = cause.downcast_ref::<std::io::Error>() {
            if error.kind() == std::io::ErrorKind::TimedOut {
                return TransportFailure::Timeout;
            }
            // Reqwest's blocking Read wraps its Error inside io::ErrorKind::Other.
            // get_ref also preserves nested io timeouts that source() can skip.
            if let Some(inner) = error.get_ref() {
                current = Some(inner);
                continue;
            }
        }
        current = cause.source();
    }
    // Discard raw diagnostics, URLs and response content.
    TransportFailure::Transport
}
