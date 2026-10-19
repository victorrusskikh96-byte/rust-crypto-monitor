//! Executable dispatch tests never invoke a valid market-data CLI operation.
use std::{
    fs::{self, File},
    io::Read,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Output, Stdio},
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const OUTPUT_LIMIT: u64 = 4096;
static FIXED_PORT: Mutex<()> = Mutex::new(());
static CAPTURE_ID: AtomicU64 = AtomicU64::new(0);

struct PortReservation {
    // Fields drop in declaration order: release the listener before the mutex.
    _listener: TcpListener,
    _guard: MutexGuard<'static, ()>,
}
impl PortReservation {
    fn new() -> Self {
        let guard = FIXED_PORT.lock().expect("fixed-port startup test failed");
        // A process-local mutex cannot exclude another test binary or application.
        // Failure to own the port is an environment failure, never a precondition.
        let listener = TcpListener::bind("127.0.0.1:3000").unwrap_or_else(|error| {
            panic!("cannot reserve 127.0.0.1:3000 for startup test; no child started: {error}")
        });
        Self {
            _listener: listener,
            _guard: guard,
        }
    }
}

struct SupervisedChild(Child);
impl Drop for SupervisedChild {
    fn drop(&mut self) {
        // Also clean up if polling/capture code panics. Child handles target only
        // our process, without process-name matching or unrelated PID termination.
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

struct Capture(PathBuf);
impl Capture {
    fn read(&self, name: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        File::open(self.0.join(name))
            .expect("open startup output")
            .take(OUTPUT_LIMIT + 1)
            .read_to_end(&mut bytes)
            .expect("read startup output");
        assert!(
            bytes.len() <= OUTPUT_LIMIT as usize,
            "startup {name} exceeded {OUTPUT_LIMIT} bytes"
        );
        bytes
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        // Remove only the two files and directory created by this invocation.
        let _ = fs::remove_file(self.0.join("stdout"));
        let _ = fs::remove_file(self.0.join("stderr"));
        let _ = fs::remove_dir(&self.0);
    }
}

fn startup(args: &[&str]) -> Output {
    let directory = std::env::temp_dir().join(format!(
        "rust-crypto-startup-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        CAPTURE_ID.fetch_add(1, Ordering::Relaxed),
    ));
    fs::create_dir(&directory).expect("create startup capture directory");
    let capture = Capture(directory);
    let mut command = Command::new(env!("CARGO_BIN_EXE_rust-crypto-monitor"));
    command
        .args(args)
        .stdin(Stdio::null())
        // Files let both streams drain without reader threads or pipe deadlocks.
        .stdout(File::create_new(capture.0.join("stdout")).expect("create stdout capture"))
        .stderr(File::create_new(capture.0.join("stderr")).expect("create stderr capture"));
    let mut child = SupervisedChild(
        command
            .spawn()
            .unwrap_or_else(|error| panic!("cannot spawn startup child {args:?}: {error}")),
    );
    drop(command);
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    let status = loop {
        if let Some(status) = child.0.try_wait().expect("poll startup child") {
            break status;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            let pid = child.0.id();
            let killed = child.0.kill();
            let reaped = child.0.wait();
            panic!(
                "startup child {pid} {args:?} exceeded {STARTUP_TIMEOUT:?}; kill={killed:?}, reap={reaped:?}"
            );
        }
        // Poll process completion; this interval is not an acceptance-time assertion.
        std::thread::sleep(remaining.min(Duration::from_millis(10)));
    };
    Output {
        status,
        stdout: capture.read("stdout"),
        stderr: capture.read("stderr"),
    }
}

#[test]
fn extra_server_arguments_preserve_cli_usage_failure_before_network() {
    let output = startup(&["--serve", "extra"]);
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap(),
        "Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n"
    );
}

#[test]
fn occupied_fixed_server_port_returns_sanitized_startup_failure() {
    let occupied = PortReservation::new();
    let output = startup(&["--serve"]);
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap(),
        "error: local API server failed\n"
    );
    // startup() returns only after try_wait has reaped the child.
    drop(occupied);
}

#[test]
fn invalid_fixture_arguments_exit_with_usage_before_server_or_client_startup() {
    for args in [
        vec!["--serve", "--fixture"],
        vec!["--serve", "--fixture", "unknown"],
        vec!["--serve", "--fixture", "SUCCESS"],
        vec!["--serve", "--fixture", "../success"],
        vec!["--serve", "--fixture", "https://example.invalid"],
        vec!["--serve", "--fixture", "success", "extra"],
        vec!["--fixture", "success"],
    ] {
        let output = startup(&args);
        assert_eq!(output.status.code(), Some(2), "{args:?}");
        assert!(output.stdout.is_empty());
        assert_eq!(
            String::from_utf8(output.stderr).unwrap(),
            "Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n"
        );
    }
}

#[test]
fn every_fixture_executable_startup_fails_closed_on_occupied_port() {
    let occupied = PortReservation::new();
    for scenario in [
        "success",
        "partial",
        "stale",
        "timeout",
        "rate-limit",
        "unavailable",
    ] {
        let output = startup(&["--serve", "--fixture", scenario]);
        assert_eq!(output.status.code(), Some(3), "{scenario}");
        assert!(output.stdout.is_empty());
        assert_eq!(
            String::from_utf8(output.stderr).unwrap(),
            "error: local API server failed\n"
        );
    }
    drop(occupied);
}
