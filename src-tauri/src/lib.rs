use std::process::Command;

// =========================================
// 1. Types & Enums
// =========================================

// Defines how the terminal window should be opened.
enum WindowMode {
    Tab,       // Open as a new tab in the existing terminal (if supported)
    NewWindow, // Force a new independent window
}

// =========================================
// 2. Tauri Commands
// =========================================

#[tauri::command]
async fn check_connection_status(target: String) -> bool {
    check_ping(&target)
}

#[tauri::command]
fn open_ssh_terminal(
    hostname: String,
    _ip: String,
    run_ros: bool,
    remote_command: String,
) -> Result<(), String> {
    // Build the SSH command arguments
    let ssh_args = if run_ros {
        // Run a specific command (e.g., ROS2 start script) inside the SSH session
        format!("ssh -t {} \"bash -i -c '{}'\"", hostname, remote_command)
    } else {
        // Standard SSH connection
        format!("ssh {}", hostname)
    };

    // Open in a new tab
    launch_terminal(&ssh_args, WindowMode::Tab)
}

#[tauri::command]
fn exec_shutdown_command(hostname: String) -> Result<(), String> {
    let ssh_args = format!("ssh -t {} \"sudo shutdown -h now\"", hostname);

    // Open in a new independent window to avoid cluttering the main workflow
    launch_terminal(&ssh_args, WindowMode::NewWindow)
}

// =========================================
// 3. Core Logic Helpers
// =========================================

/// Helper function to execute a ping command with a timeout.
fn check_ping(target: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("ping")
            .args(["-n", "1", target])
            .args(["-w", "1000"]) // 1000ms timeout
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("ping")
            .args(["-c", "1", target])
            .args(["-W", "1"]) // 1s timeout
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// Common entry point to launch the terminal based on the OS.
fn launch_terminal(ssh_args: &str, mode: WindowMode) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return launch_on_windows(ssh_args, mode);

    #[cfg(target_os = "macos")]
    return launch_on_macos(ssh_args, mode);

    #[cfg(target_os = "linux")]
    return launch_on_linux(ssh_args, mode);

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err("Unsupported OS".to_string());
}

// =========================================
// 4. OS-Specific Implementations
// =========================================

#[cfg(target_os = "windows")]
fn launch_on_windows(ssh_args: &str, mode: WindowMode) -> Result<(), String> {
    // -w 0: Open in the current window (New Tab)
    // -w -1: Open in a new window
    let window_flag = match mode {
        WindowMode::Tab => "0",
        WindowMode::NewWindow => "-1",
    };

    Command::new("wt")
        .args(["-w", window_flag, "new-tab", "cmd", "/k", ssh_args])
        .spawn()
        .map_err(|e| format!("Failed to launch Windows Terminal: {}", e))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_on_macos(ssh_args: &str, mode: WindowMode) -> Result<(), String> {
    let script = match mode {
        WindowMode::Tab => format!(
            "tell application \"Terminal\"
                activate
                try
                    tell application \"System Events\" to keystroke \"t\" using command down
                on error
                end try
                delay 0.2
                do script \"{}\" in front window
            end tell",
            ssh_args
        ),
        WindowMode::NewWindow => format!(
            "tell application \"Terminal\"
                activate
                do script \"{}\"
            end tell",
            ssh_args
        ),
    };

    Command::new("osascript")
        .args(["-e", &script])
        .spawn()
        .map_err(|e| format!("Failed to launch Terminal: {}", e))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn launch_on_linux(ssh_args: &str, mode: WindowMode) -> Result<(), String> {
    let flag = match mode {
        WindowMode::Tab => "--tab",
        WindowMode::NewWindow => "--window",
    };

    Command::new("gnome-terminal")
        // Remove AppImage-specific environment variables to prevent conflicts
        // with the system python (fixing "ModuleNotFoundError: encodings").
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("GIO_MODULE_DIR")
        .args([
            flag,
            "--",
            "bash",
            "-c",
            &format!("{}; exec bash", ssh_args),
        ])
        .spawn()
        .map_err(|e| format!("Failed to launch gnome-terminal: {}", e))?;
    Ok(())
}

// =========================================
// 5. Application Entry Point
// =========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_connection_status,
            open_ssh_terminal,
            exec_shutdown_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
