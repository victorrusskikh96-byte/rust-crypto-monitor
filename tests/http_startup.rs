//! Executable dispatch tests never invoke a valid market-data CLI operation.
use std::process::Command;

#[test]
fn extra_server_arguments_preserve_cli_usage_failure_before_network() {
    let output = Command::new(env!("CARGO_BIN_EXE_rust-crypto-monitor"))
        .args(["--serve", "extra"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap(),
        "Usage: rust-crypto-monitor <BTC/USDT|ETH/USDT>\n"
    );
}

#[test]
fn occupied_fixed_server_port_returns_sanitized_startup_failure() {
    // An existing local owner also makes the address unavailable; never contact it.
    let occupied = std::net::TcpListener::bind("127.0.0.1:3000");
    if let Err(error) = &occupied {
        assert_eq!(error.kind(), std::io::ErrorKind::AddrInUse);
    }
    let output = Command::new(env!("CARGO_BIN_EXE_rust-crypto-monitor"))
        .arg("--serve")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap(),
        "error: local API server failed\n"
    );
}
