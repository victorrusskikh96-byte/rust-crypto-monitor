//! The only owner of the blocking client; no Send bound on transport/clock.
use super::*;
use crate::market_data::{
    MarketDataAdapter,
    transport::HttpTransport,
    types::{Clock, TimeoutConfig},
};
use std::{
    sync::mpsc::{self, Receiver, TrySendError},
    thread::{self, JoinHandle},
};
use tokio::sync::oneshot;

pub(super) struct Command {
    completion: oneshot::Sender<Result<Value, ApiError>>,
}
type Ready = oneshot::Receiver<Result<(), ApiError>>;
pub(super) struct Worker {
    app: Arc<App>,
    thread: Option<JoinHandle<()>>,
}
impl Worker {
    pub(super) fn start<T: HttpTransport + 'static>(
        app: Arc<App>,
        factory: impl FnOnce() -> Result<T, MarketDataError> + Send + 'static,
    ) -> io::Result<(Self, Ready)> {
        let (send, receive) = mpsc::sync_channel(1);
        {
            let mut state = app.state();
            if state.worker_started || app.stopping.load(Ordering::Acquire) {
                return Err(io::Error::other("worker cannot start"));
            }
            state.worker_started = true;
            state.commands = Some(send);
        }
        let (ready, notification) = oneshot::channel();
        let owner = app.clone();
        let thread = thread::Builder::new()
            .name("market-refresh".into())
            .spawn(move || {
                // Created before transport so cleanup observes transport destruction,
                // including initialization errors and unwinding outside the runtime.
                let _exit = ExitGuard(owner.clone());
                let mut transport = match factory() {
                    Ok(transport) => transport,
                    Err(error) => {
                        let error = ApiError::Provider(error);
                        let mut state = owner.state();
                        state.service_error = Some(error);
                        state.changed();
                        drop(state);
                        let _ = ready.send(Err(error));
                        return;
                    }
                };
                {
                    let mut state = owner.state();
                    state.worker_available = true;
                    state.changed();
                }
                let _ = ready.send(Ok(()));
                work(&owner, &mut transport, receive);
            });
        match thread {
            Ok(thread) => Ok((
                Self {
                    app,
                    thread: Some(thread),
                },
                notification,
            )),
            Err(_) => {
                let mut state = app.state();
                state.commands.take();
                state.service_error = Some(ApiError::WorkerUnavailable);
                state.changed();
                Err(io::Error::other("worker unavailable"))
            }
        }
    }
    pub(super) fn join(mut self) -> thread::Result<()> {
        self.thread.take().expect("worker owner").join()
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        if let Some(thread) = self.thread.take() {
            self.app.stop();
            let _ = thread.join();
        }
    }
}
struct ExitGuard(Arc<App>);
impl Drop for ExitGuard {
    fn drop(&mut self) {
        let mut state = self.0.state();
        state.worker_available = false;
        state.commands.take();
        state.busy = false;
        if !self.0.stopping.load(Ordering::Acquire) {
            state.service_error.get_or_insert(ApiError::WorkerFailed);
        }
        for market in &mut state.markets {
            if market.loading {
                market.loading = false;
                market.last_error = Some(ApiError::WorkerFailed);
            }
        }
        state.changed();
        drop(state);
        self.0.notify_worker();
    }
}
struct ObservationClock<'a>(&'a App);
impl Clock for ObservationClock<'_> {
    fn now(&self) -> SystemTime {
        self.0.clock.wall_now()
    }
}
impl App {
    fn notify_worker(&self) {
        #[cfg(test)]
        self.worker_changed.notify_waiters();
    }
    pub(super) fn admit(&self) -> Result<oneshot::Receiver<Result<Value, ApiError>>, ApiError> {
        let mut state = self.state();
        if self.stopping.load(Ordering::Acquire) {
            return Err(ApiError::Stopping);
        }
        if !state.worker_available || state.service_error.is_some() {
            return Err(ApiError::WorkerUnavailable);
        }
        if state.busy {
            return Err(ApiError::RefreshInProgress);
        }
        let now = self.now();
        let remaining = state.remaining_ms(now);
        if remaining != 0 {
            return Err(ApiError::RefreshCooldown(remaining));
        }
        let Some(next_start) = now.checked_add(Duration::from_secs(30)) else {
            state.service_error = Some(ApiError::CooldownUnrepresentable);
            state.changed();
            return Err(ApiError::WorkerUnavailable);
        };
        let (completion, receive) = oneshot::channel();
        // Lock covers checks, nonblocking dispatch and publication. Worker cannot
        // start the command until this lock releases. No second command is admitted.
        match state
            .commands
            .as_ref()
            .ok_or(ApiError::WorkerUnavailable)?
            .try_send(Command { completion })
        {
            Ok(()) => {
                state.busy = true;
                state.next_start = Some(next_start);
                state.changed();
                Ok(receive)
            }
            Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) => {
                state.worker_available = false;
                state.service_error = Some(ApiError::WorkerUnavailable);
                state.commands.take();
                state.changed();
                Err(ApiError::WorkerUnavailable)
            }
        }
    }
}
fn work(app: &App, transport: &mut dyn HttpTransport, receive: Receiver<Command>) {
    let settings = TimeoutConfig::default();
    while let Ok(command) = receive.recv() {
        #[cfg(test)]
        test_gate(app, 0);
        for (index, pair) in [(0, Pair::BtcUsdt), (1, Pair::EthUsdt)] {
            #[cfg(test)]
            if index == 1 {
                test_gate(app, 1);
            }
            {
                let mut state = app.state();
                if app.stopping.load(Ordering::Acquire) {
                    break;
                }
                state.markets[index].last_attempt_at = Some(app.clock.wall_now());
                state.markets[index].loading = true;
                state.changed();
            }
            // Every construct/use/drop of the transport occurs on this thread.
            // No state lock is held across the adapter or provider call.
            let outcome = MarketDataAdapter::new(
                transport,
                &ObservationClock(app),
                settings.connect_timeout(),
                settings.request_timeout(),
            )
            .and_then(|mut adapter| adapter.fetch_price(pair));
            let now = app.now();
            let mut state = app.state();
            let market = &mut state.markets[index];
            market.loading = false;
            match outcome {
                Ok(observation) => {
                    market.observation = Some(TimedObservation {
                        observation,
                        received: now,
                    });
                    market.last_error = None;
                }
                Err(error) => market.last_error = Some(ApiError::Provider(error)),
            }
            let rate_limited =
                if let Err(MarketDataError::RateLimited { retry_after, .. }) = outcome {
                    let duration = retry_after.unwrap_or_default().max(Duration::from_secs(60));
                    match now.checked_add(duration) {
                        Some(deadline) => {
                            state.next_start =
                                Some(state.next_start.map_or(deadline, |old| old.max(deadline)))
                        }
                        None => state.service_error = Some(ApiError::CooldownUnrepresentable),
                    }
                    true
                } else {
                    false
                };
            state.changed();
            drop(state);
            app.notify_worker();
            if rate_limited {
                break;
            }
        }
        let result = {
            let mut state = app.state();
            state.busy = false;
            state.changed();
            if app.stopping.load(Ordering::Acquire) {
                Err(ApiError::Stopping)
            } else {
                Ok(app.dashboard_locked(&state))
            }
        };
        // Waiter cancellation only discards delivery; it never owns admission.
        let _ = command.completion.send(result);
        app.notify_worker();
    }
}

#[cfg(test)]
pub(super) struct TestGate {
    pub(super) entered: oneshot::Sender<()>,
    pub(super) release: Receiver<()>,
}
#[cfg(test)]
fn test_gate(app: &App, index: usize) {
    let gate = app.worker_gates.lock().unwrap()[index].take();
    if let Some(gate) = gate {
        let _ = gate.entered.send(());
        let _ = gate.release.recv();
    }
}
