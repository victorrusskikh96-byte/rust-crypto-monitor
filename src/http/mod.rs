//! Bounded local HTTP boundary. This module has no provider client or fetch capability.
use crate::{
    market_data::types::{Pair, PriceObservation},
    portfolio::{
        HoldingValuation, IncompleteReason, Portfolio, Quantity, Quote, ValuationError,
        ValuationState,
    },
};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{Method, StatusCode, Version, header},
    response::Response,
};
use hyper::body::Body as HttpBody;
use hyper_util::{rt::TokioIo, service::TowerToHyperService};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::hash_map::RandomState,
    future::Future,
    hash::BuildHasher,
    io,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::{TcpListener, TcpStream},
    sync::{OwnedSemaphorePermit, Semaphore, watch},
    task::JoinSet,
    time::Instant,
};

const READ_BUDGET: Duration = Duration::from_secs(5);
const RESPONSE_BUDGET: Duration = Duration::from_secs(25);
const BODY_LIMIT: usize = 4096;
const RESPONSE_LIMIT: usize = 32768;
type SleepFuture<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;
trait TimeSource: Send + Sync {
    fn now(&self) -> Instant;
    fn sleep_until(&self, deadline: Instant) -> SleepFuture<'_>;
}
struct MonotonicTime;
impl TimeSource for MonotonicTime {
    fn now(&self) -> Instant {
        Instant::now()
    }
    fn sleep_until(&self, deadline: Instant) -> SleepFuture<'_> {
        Box::pin(tokio::time::sleep_until(deadline))
    }
}

#[derive(Clone, Copy)]
struct TimedObservation {
    observation: PriceObservation,
    received: Instant,
}
#[derive(Clone, Copy, Default)]
struct Market {
    observation: Option<TimedObservation>,
    last_attempt_at: Option<SystemTime>,
    last_error: Option<ApiError>,
}
impl Market {
    fn quote(self, now: Instant) -> Option<Quote> {
        self.observation.map(|stored| {
            Quote::new(
                stored.observation,
                now.checked_duration_since(stored.received)
                    .unwrap_or(Duration::MAX),
                self.last_error.is_none() && self.last_attempt_at.is_some(),
            )
        })
    }
    fn dashboard(self, pair: Pair, now: Instant, mode: &str) -> Value {
        let quote = self.quote(now);
        json!({
            "pair":pair.to_string(),
            "state":match quote { None=>"unavailable", Some(q) if q.is_fresh()=>"success", Some(_)=>"stale" },
            "observation":self.observation.map(|stored| json!({
                "price":stored.observation.price.to_string(),"quote":"USDT","provider":"Binance",
                "observed_at_ms":timestamp(stored.observation.received_at),"provenance":mode
            })),
            "observation_age_ms":self.observation.map(|stored| now.checked_duration_since(stored.received).unwrap_or(Duration::MAX).as_millis().to_string()),
            "last_attempt_at_ms":self.last_attempt_at.and_then(timestamp),
            "last_success_at_ms":self.observation.and_then(|stored| timestamp(stored.observation.received_at)),
            "attempt_state":if self.last_error.is_some() { "failed" } else if self.last_attempt_at.is_some() { "success" } else { "not_attempted" },
            "last_error":self.last_error.map(ApiError::envelope_value).map(|v|v["error"].clone())
        })
    }
}
struct Snapshot {
    id: String,
    mode: &'static str,
    markets: [Market; 2],
}
struct App {
    authority: String,
    origin: String,
    snapshot: Snapshot,
    clock: Arc<dyn TimeSource>,
    connections: Arc<Semaphore>,
    handlers: Arc<Semaphore>,
    stopping: AtomicBool,
    #[cfg(test)]
    changed: tokio::sync::Notify,
    #[cfg(test)]
    processing_gate: Option<Arc<tokio::sync::Notify>>,
    #[cfg(test)]
    processing_entered: tokio::sync::Notify,
}
impl App {
    fn new(authority: String, clock: Arc<dyn TimeSource>) -> Self {
        Self {
            origin: format!("http://{authority}"),
            authority,
            snapshot: Snapshot {
                // Run-local generation identity, never an authentication token.
                id: format!("{:016x}", RandomState::new().hash_one(SystemTime::now())),
                mode: "real",
                markets: [Market::default(); 2],
            },
            clock,
            connections: Arc::new(Semaphore::new(32)),
            handlers: Arc::new(Semaphore::new(8)),
            stopping: AtomicBool::new(false),
            #[cfg(test)]
            changed: tokio::sync::Notify::new(),
            #[cfg(test)]
            processing_gate: None,
            #[cfg(test)]
            processing_entered: tokio::sync::Notify::new(),
        }
    }
    fn notify_limits(&self) {
        #[cfg(test)]
        self.changed.notify_waiters();
    }
    fn slot(self: &Arc<Self>, connections: bool) -> Result<Slot, ApiError> {
        let semaphore = if connections {
            &self.connections
        } else {
            &self.handlers
        };
        let permit = semaphore
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::Overloaded)?;
        self.notify_limits();
        Ok(Slot {
            permit: Some(permit),
            app: self.clone(),
        })
    }
    fn dashboard(&self) -> Value {
        let now = self.clock.now();
        json!({
            "schema_version":1,"mode":self.snapshot.mode,"snapshot_id":self.snapshot.id,
            "freshness_ttl_ms":"60000","refresh_in_progress":false,
            "service_state":if self.stopping.load(Ordering::Acquire) { "stopping" } else { "ready" },
            "service_error":null,"refresh_allowed_in_ms":"0",
            "markets":[self.snapshot.markets[0].dashboard(Pair::BtcUsdt,now,self.snapshot.mode), self.snapshot.markets[1].dashboard(Pair::EthUsdt,now,self.snapshot.mode)]
        })
    }
    fn valuation(&self, request: ValuationRequest) -> Result<Value, ApiError> {
        let btc = request
            .quantities
            .btc
            .parse::<Quantity>()
            .map_err(|_| ApiError::InvalidQuantity("quantities.BTC"))?;
        let eth = request
            .quantities
            .eth
            .parse::<Quantity>()
            .map_err(|_| ApiError::InvalidQuantity("quantities.ETH"))?;
        if self.stopping.load(Ordering::Acquire) {
            return Err(ApiError::Stopping);
        }
        if request.snapshot_id != self.snapshot.id {
            return Err(ApiError::SnapshotReplaced);
        }
        // Snapshot is immutable in M2b.1. One monotonic instant supplies both ages.
        let now = self.clock.now();
        let valuation = Portfolio::new(btc, eth)
            .value(
                self.snapshot.markets[0].quote(now),
                self.snapshot.markets[1].quote(now),
            )
            .map_err(|error| match error {
                ValuationError::ArithmeticCapacity => ApiError::ArithmeticCapacity,
                ValuationError::UnrepresentableValue => ApiError::UnrepresentableValue,
                ValuationError::InvalidQuantity | ValuationError::InvalidQuote => {
                    ApiError::Internal
                }
            })?;
        Ok(json!({
            "snapshot_id":self.snapshot.id,"quote":"USDT",
            "state":match valuation.state() { ValuationState::Complete=>"complete",ValuationState::Incomplete=>"incomplete" },
            "holdings":[holding(valuation.btc(),"BTC"),holding(valuation.eth(),"ETH")],
            "total":valuation.total().map(|total|total.to_string()),
            "allocation_rounding":"independent_half_even_2dp","estimate":true
        }))
    }
}
struct Slot {
    permit: Option<OwnedSemaphorePermit>,
    app: Arc<App>,
}
impl Drop for Slot {
    fn drop(&mut self) {
        drop(self.permit.take());
        self.app.notify_limits();
    }
}
fn holding(holding: &HoldingValuation, asset: &str) -> Value {
    json!({"asset":asset,"quantity":holding.quantity().to_string(),
        "price":holding.quote().map(|q|q.observation().price.to_string()),
        "value":holding.value().map(|v|v.to_string()),
        "allocation_pct":holding.allocation().map(|p|p.to_string()),
        "reason":holding.reason().map(|reason|match reason { IncompleteReason::QuoteMissing=>"quote_missing",IncompleteReason::QuoteStale=>"quote_stale" })})
}
fn timestamp(time: SystemTime) -> Option<String> {
    // Signed Unix milliseconds, including the sign for sub-millisecond pre-epoch times.
    let milliseconds = match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => i128::try_from(duration.as_millis()).ok()?,
        Err(error) => {
            let duration = error.duration();
            let magnitude = duration.as_millis().checked_add(u128::from(
                !duration.subsec_nanos().is_multiple_of(1_000_000),
            ))?;
            -i128::try_from(magnitude).ok()?
        }
    };
    Some(milliseconds.to_string())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ValuationRequest {
    snapshot_id: String,
    quantities: Quantities,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Quantities {
    #[serde(rename = "BTC")]
    btc: String,
    #[serde(rename = "ETH")]
    eth: String,
}

#[derive(Clone, Copy)]
enum ApiError {
    InvalidRequest,
    InvalidQuantity(&'static str),
    ForbiddenHost,
    ForbiddenOrigin,
    NotFound,
    MethodNotAllowed,
    BodyTooLarge,
    UnsupportedMediaType,
    SnapshotReplaced,
    ArithmeticCapacity,
    UnrepresentableValue,
    Overloaded,
    Stopping,
    Internal,
}
impl ApiError {
    fn details(self) -> (StatusCode, &'static str, &'static str, Option<&'static str>) {
        match self {
            Self::InvalidRequest => (
                StatusCode::BAD_REQUEST,
                "invalid_request",
                "Invalid request",
                None,
            ),
            Self::InvalidQuantity(field) => (
                StatusCode::BAD_REQUEST,
                "invalid_quantity",
                "Enter an unsigned decimal quantity",
                Some(field),
            ),
            Self::ForbiddenHost => (
                StatusCode::FORBIDDEN,
                "invalid_host",
                "Host is not allowed",
                None,
            ),
            Self::ForbiddenOrigin => (
                StatusCode::FORBIDDEN,
                "invalid_origin",
                "Origin is not allowed",
                None,
            ),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found", "Route not found", None),
            Self::MethodNotAllowed => (
                StatusCode::METHOD_NOT_ALLOWED,
                "method_not_allowed",
                "Method is not allowed",
                None,
            ),
            Self::BodyTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "body_too_large",
                "Request body exceeds the limit",
                None,
            ),
            Self::UnsupportedMediaType => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "unsupported_media_type",
                "Use application/json without content encoding",
                None,
            ),
            Self::SnapshotReplaced => (
                StatusCode::CONFLICT,
                "snapshot_replaced",
                "Reread the dashboard and explicitly recalculate",
                None,
            ),
            Self::ArithmeticCapacity => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "arithmetic_capacity",
                "Portfolio arithmetic capacity exceeded",
                None,
            ),
            Self::UnrepresentableValue => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "unrepresentable_value",
                "Exact portfolio value is not representable",
                None,
            ),
            Self::Overloaded => (
                StatusCode::SERVICE_UNAVAILABLE,
                "overloaded",
                "Service is busy",
                None,
            ),
            Self::Stopping => (
                StatusCode::SERVICE_UNAVAILABLE,
                "service_stopping",
                "Service is stopping",
                None,
            ),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Internal service error",
                None,
            ),
        }
    }
    fn envelope_value(self) -> Value {
        let (_, code, message, field) = self.details();
        let mut error = json!({"code":code,"message":message});
        if let Some(field) = field {
            error["field"] = json!(field);
        }
        json!({"error":error})
    }
    fn response(self) -> Response {
        json_response(self.details().0, &self.envelope_value())
    }
}
fn json_response(mut status: StatusCode, value: &Value) -> Response {
    let bytes = match serde_json::to_vec(value) {
        Ok(bytes) if bytes.len() <= RESPONSE_LIMIT => bytes,
        _ => {
            status = StatusCode::INTERNAL_SERVER_ERROR;
            br#"{"error":{"code":"internal_error","message":"Internal service error"}}"#.to_vec()
        }
    };
    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = status;
    for (name, value) in [
        ("content-type", "application/json"),
        ("cache-control", "no-store"),
        ("connection", "close"),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        (
            "content-security-policy",
            "default-src 'none'; frame-ancestors 'none'",
        ),
    ] {
        response.headers_mut().insert(
            header::HeaderName::from_static(name),
            header::HeaderValue::from_static(value),
        );
    }
    response
}
fn exact_header(headers: &header::HeaderMap, name: header::HeaderName, expected: &str) -> bool {
    let mut values = headers.get_all(name).iter();
    matches!(values.next(),Some(value) if value.as_bytes()==expected.as_bytes())
        && values.next().is_none()
}
fn json_content_type(headers: &header::HeaderMap) -> bool {
    let mut values = headers.get_all(header::CONTENT_TYPE).iter();
    let Some(value) = values.next().and_then(|v| v.to_str().ok()) else {
        return false;
    };
    if values.next().is_some() {
        return false;
    }
    let mut parts = value.split(';');
    if !parts
        .next()
        .is_some_and(|part| part.trim().eq_ignore_ascii_case("application/json"))
    {
        return false;
    }
    if let Some(parameter) = parts.next() {
        let Some((name, value)) = parameter.split_once('=') else {
            return false;
        };
        if !name.trim().eq_ignore_ascii_case("charset")
            || !value.trim().eq_ignore_ascii_case("utf-8")
        {
            return false;
        }
    }
    parts.next().is_none()
}
#[derive(Clone)]
struct ConnectionState {
    app: Arc<App>,
    deadline: watch::Sender<Instant>,
    allowed_write: Arc<AtomicBool>,
}
async fn dispatch(State(connection): State<ConnectionState>, request: Request) -> Response {
    let result = handle(&connection, request).await;
    let response = match result {
        Ok(value) => json_response(StatusCode::OK, &value),
        Err(error) => error.response(),
    };
    // Hyper-generated parser errors/100-continue never pass through this flag.
    connection.allowed_write.store(true, Ordering::Release);
    response
}
async fn handle(connection: &ConnectionState, request: Request) -> Result<Value, ApiError> {
    let app = &connection.app;
    let _handler = app.slot(false)?;
    if !exact_header(request.headers(), header::HOST, &app.authority) {
        return Err(ApiError::ForbiddenHost);
    }
    let has_origin = request.headers().contains_key(header::ORIGIN);
    if (has_origin || request.method() == Method::POST)
        && !exact_header(request.headers(), header::ORIGIN, &app.origin)
    {
        return Err(ApiError::ForbiddenOrigin);
    }
    if request.version() != Version::HTTP_11
        || request.uri().scheme().is_some()
        || request.uri().authority().is_some()
        || request.uri().to_string().len() > 2048
        || request.uri().query().is_some()
        || request.headers().contains_key(header::UPGRADE)
        || request.headers().contains_key(header::EXPECT)
        || request
            .headers()
            .get_all(header::CONNECTION)
            .iter()
            .any(|value| {
                value.to_str().is_ok_and(|value| {
                    value
                        .split(',')
                        .any(|token| token.trim().eq_ignore_ascii_case("upgrade"))
                })
            })
    {
        return Err(ApiError::InvalidRequest);
    }
    let valuation = match request.uri().path() {
        "/api/v1/dashboard" => false,
        "/api/v1/valuation" => true,
        _ => return Err(ApiError::NotFound),
    };
    if request.method() != if valuation { Method::POST } else { Method::GET } {
        return Err(ApiError::MethodNotAllowed);
    }
    if app.stopping.load(Ordering::Acquire) && valuation {
        return Err(ApiError::Stopping);
    }
    if request.headers().contains_key(header::CONTENT_ENCODING)
        || (valuation && !json_content_type(request.headers()))
    {
        return Err(ApiError::UnsupportedMediaType);
    }
    if request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > BODY_LIMIT as u64)
    {
        return Err(ApiError::BodyTooLarge);
    }
    let mut incoming = request.into_body();
    let mut body = Vec::with_capacity(BODY_LIMIT);
    while let Some(frame) = std::future::poll_fn(|cx| Pin::new(&mut incoming).poll_frame(cx)).await
    {
        let frame = frame.map_err(|_| ApiError::InvalidRequest)?;
        if let Ok(data) = frame.into_data() {
            if data.len() > BODY_LIMIT - body.len() {
                return Err(ApiError::BodyTooLarge);
            }
            body.extend_from_slice(&data);
        }
    }
    let input = if valuation {
        let input: ValuationRequest =
            serde_json::from_slice(&body).map_err(|_| ApiError::InvalidRequest)?;
        if input.snapshot_id.is_empty()
            || input.snapshot_id.len() > 128
            || !input
                .snapshot_id
                .bytes()
                .all(|byte| byte.is_ascii_graphic())
        {
            return Err(ApiError::InvalidRequest);
        }
        Some(input)
    } else {
        if !body.is_empty() {
            return Err(ApiError::InvalidRequest);
        }
        None
    };
    connection
        .deadline
        .send_replace(app.clock.now() + RESPONSE_BUDGET);
    #[cfg(test)]
    if let Some(gate) = &app.processing_gate {
        app.processing_entered.notify_one();
        gate.notified().await;
    }
    match input {
        Some(input) => app.valuation(input),
        None => Ok(app.dashboard()),
    }
}

// No HTTP parsing here: writes are enabled only after our application constructs
// a sanitized response. Early Hyper parser failures close the single-use socket.
struct ResponseIo {
    stream: TcpStream,
    allowed_write: Arc<AtomicBool>,
}
impl AsyncRead for ResponseIo {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_read(cx, buffer)
    }
}
impl AsyncWrite for ResponseIo {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buffer: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        if !this.allowed_write.load(Ordering::Acquire) {
            return Poll::Ready(Err(io::Error::from(io::ErrorKind::ConnectionAborted)));
        }
        Pin::new(&mut this.stream).poll_write(cx, buffer)
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_flush(cx)
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stream).poll_shutdown(cx)
    }
}
async fn connection(stream: TcpStream, app: Arc<App>, _connection: Slot, read_deadline: Instant) {
    let (deadline, mut changed) = watch::channel(read_deadline);
    let allowed_write = Arc::new(AtomicBool::new(false));
    let router = Router::new()
        .fallback(dispatch)
        .with_state(ConnectionState {
            app: app.clone(),
            deadline,
            allowed_write: allowed_write.clone(),
        });
    let mut builder = hyper::server::conn::http1::Builder::new();
    builder
        .keep_alive(false)
        .max_headers(64)
        .max_header_size(16384)
        .max_buf_size(16384)
        .header_read_timeout(None);
    let io = TokioIo::new(ResponseIo {
        stream,
        allowed_write,
    });
    let future = builder.serve_connection(io, TowerToHyperService::new(router));
    tokio::pin!(future);
    loop {
        let deadline = *changed.borrow_and_update();
        tokio::select! {
            biased;
            result=changed.changed()=>if result.is_err() { break; },
            _=app.clock.sleep_until(deadline)=>break,
            _=&mut future=>break,
        }
    }
}
async fn bind(port: u16) -> io::Result<TcpListener> {
    TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await
}
async fn serve(
    listener: TcpListener,
    app: Arc<App>,
    shutdown: impl Future<Output = ()>,
) -> io::Result<()> {
    let address = listener.local_addr()?;
    if address.ip() != std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
        || address.to_string() != app.authority
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid local listener",
        ));
    }
    tokio::pin!(shutdown);
    let mut tasks = JoinSet::new();
    let result = loop {
        while tasks.try_join_next().is_some() {}
        tokio::select! {
            biased;
            _=&mut shutdown=>break Ok(()),
            accepted=listener.accept()=>match accepted {
                Ok((stream,_))=> {
                    if tasks.len()>=32 { drop(stream); continue; }
                    let Ok(slot)=app.slot(true) else { drop(stream); continue; };
                    let deadline=app.clock.now()+READ_BUDGET;
                    tasks.spawn(connection(stream,app.clone(),slot,deadline));
                },
                Err(_)=>break Err(io::Error::other("local listener failed")),
            },
            _=tasks.join_next(), if !tasks.is_empty()=>{},
        }
    };
    app.stopping.store(true, Ordering::Release);
    drop(listener);
    let drain_deadline = app.clock.now() + RESPONSE_BUDGET;
    while !tasks.is_empty() {
        tokio::select! {
            biased;
            _=tasks.join_next()=>{},
            _=app.clock.sleep_until(drain_deadline)=> { tasks.abort_all(); break; },
        }
    }
    while tasks.join_next().await.is_some() {}
    result
}

/// Start the only production server mode. It cannot construct a provider client.
/// The caller reports a static diagnostic on error, never the underlying OS text.
pub fn run() -> io::Result<()> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(1)
        .build()?;
    runtime.block_on(async {
        let listener = bind(3000).await?;
        let app = Arc::new(App::new("127.0.0.1:3000".into(), Arc::new(MonotonicTime)));
        let mut signal_result = Ok(());
        serve(listener, app, async {
            signal_result = tokio::signal::ctrl_c().await;
        })
        .await?;
        signal_result
    })
}
#[cfg(test)]
mod tests;
