#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures::future::join_all;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::sync::OnceLock;

// --- Types ---

enum WindowMode {
    Tab,
    NewWindow,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CheckItem {
    status: String,
    name: String,
    description: String,
    details: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemCheckReport {
    summary: Vec<CheckItem>,
    detailed: String,
    raw: String,
}

// --- Commands ---

#[tauri::command]
async fn check_connection_status(target: String) -> bool {
    check_ping(&target)
}

#[tauri::command]
async fn check_batch_connections(targets: Vec<String>) -> HashMap<String, bool> {
    // ターゲットごとに非同期タスク(tokio::spawn)を生成
    let tasks: Vec<_> = targets
        .into_iter()
        .map(|ip| {
            // tokio::spawn を使うことで、OSスレッドをブロックせずに並列実行
            tokio::spawn(async move {
                let is_online = check_ping(&ip);
                (ip, is_online)
            })
        })
        .collect();

    // 全てのタスクが完了するのを待つ
    let results = join_all(tasks).await;

    // 結果を集計
    let mut status_map = HashMap::new();
    for res in results {
        // タスクが正常終了した場合のみ登録 (Panic時などは無視)
        if let Ok((ip, is_online)) = res {
            status_map.insert(ip, is_online);
        }
    }
    status_map
}

#[tauri::command]
fn open_ssh_terminal(
    hostname: String,
    ip: String,
    run_ros: bool,
    remote_command: String,
) -> Result<(), String> {
    let is_local = ip == "127.0.0.1" || hostname == "localhost";

    let shell_args = if is_local {
        if run_ros {
            format!("bash -i -c '{}'", remote_command)
        } else {
            "echo 'Starting Local Terminal'".to_string()
        }
    } else if run_ros {
        format!("ssh -t {} \"bash -i -c '{}'\"", hostname, remote_command)
    } else {
        format!("ssh {}", hostname)
    };

    launch_terminal(&shell_args, WindowMode::Tab)
}

#[tauri::command]
fn exec_shutdown_command(hostname: String) -> Result<(), String> {
    let ssh_args = format!("ssh -t {} \"sudo shutdown -h now\"", hostname);
    launch_terminal(&ssh_args, WindowMode::NewWindow)
}

#[tauri::command]
async fn run_system_check(hostname: String) -> Result<SystemCheckReport, String> {
    // パイプライン処理を含む複雑なリモートコマンド
    let remote_cmd = r##"bash -i -c 'ros2_start -- bash -i -c "RCUTILS_CONSOLE_OUTPUT_FORMAT=\"{message}\" ros2 launch system_health_check system_health_check.launch.py | sed -u \"s/^\[component_container_mt-[0-9]\+\][: ]*//g\""'"##;

    let output = Command::new("ssh")
        .args([&hostname, remote_cmd])
        .output()
        .map_err(|e| format!("SSH execution failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        // エラー時も標準出力があればパースを試みる場合もあるが、ここではエラーを返す
        return Err(format!("Exit code: {}\nStdErr: {}", output.status, stderr));
    }

    println!("--- Remote Environment Variables ---\n{}", stdout);

    Ok(parse_check_output(&stdout))
}

// --- Core Logic ---

fn check_ping(target: &str) -> bool {
    let mut cmd = Command::new("ping");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.args(["-n", "1", "-w", "1000", target])
            .creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    {
        cmd.args(["-c", "1", "-W", "1", target]);
    }

    cmd.status().map(|s| s.success()).unwrap_or(false)
}

fn strip_ansi_and_symbols(line: &str) -> String {
    // Regexのコンパイルはコストが高いため、OnceLockで再利用する
    static ANSI_REGEX: OnceLock<Regex> = OnceLock::new();
    let regex = ANSI_REGEX.get_or_init(|| Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap());

    let no_ansi = regex.replace_all(line, "");
    no_ansi.replace("", "").trim().to_string()
}

fn parse_check_output(text: &str) -> SystemCheckReport {
    let start_marker = "=== Check Start ===";
    let end_marker = "=======================";
    let split_marker = "=== Detailed Report ===";

    // 範囲抽出
    let start = text.find(start_marker).unwrap_or(0);
    let end = text.rfind(end_marker).unwrap_or(text.len());
    let valid_text = if start == 0 && end == text.len() {
        text
    } else {
        &text[start..end + end_marker.len()]
    };

    let parts: Vec<&str> = valid_text.split(split_marker).collect();
    let summary_part = parts.first().unwrap_or(&"");
    let detailed_raw = parts
        .get(1)
        .map(|s| format!("{}{}", split_marker, s))
        .unwrap_or_default();
    let detailed_clean = strip_ansi_and_symbols(&detailed_raw);

    // 詳細ログのマップ化 (Name -> Log)
    let mut details_map: HashMap<String, String> = HashMap::new();
    for line in detailed_clean.lines() {
        let line = line.trim();
        if line.is_empty() || line.contains(split_marker) {
            continue;
        }

        if let Some((name, log)) = line.split_once(',') {
            details_map
                .entry(name.trim().to_string())
                .and_modify(|e| {
                    e.push('\n');
                    e.push_str(log.trim());
                })
                .or_insert_with(|| log.trim().to_string());
        }
    }

    // Summaryパース
    let mut summary_items = Vec::new();
    for line in summary_part.lines() {
        let clean = strip_ansi_and_symbols(line);
        if clean.contains("[PASS]") || clean.contains("[FAIL]") {
            let status = if clean.contains("[PASS]") {
                "PASS"
            } else {
                "FAIL"
            };
            let content = clean.replace(&format!("[{}]", status), "");

            let (name, desc) = content
                .split_once(',')
                .map(|(n, d)| (n.trim().to_string(), d.trim().to_string()))
                .unwrap_or((content.trim().to_string(), String::new()));

            let details = details_map.get(&name).cloned().unwrap_or_default();

            summary_items.push(CheckItem {
                status: status.to_string(),
                name,
                description: desc,
                details,
            });
        } else if clean.starts_with("Plugin error:") {
            // エラー文言中の "class type XXXXX" からクラス名を抽出
            let name = if let Some(idx) = clean.find("class type ") {
                clean[idx + 11..]
                    .split_whitespace()
                    .next()
                    .unwrap_or("Plugin Error")
                    .to_string()
            } else {
                "Plugin Load Error".to_string()
            };

            summary_items.push(CheckItem {
                status: "FAIL".to_string(),
                name,
                description: clean.clone(), // エラー文全体を表示
                details: format!("Raw Error: {}", clean),
            });
        }
    }

    SystemCheckReport {
        summary: summary_items,
        detailed: detailed_clean,
        raw: valid_text.to_string(),
    }
}

// --- OS Specific Launchers ---

fn launch_terminal(ssh_args: &str, mode: WindowMode) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let flag = match mode {
            WindowMode::Tab => "0",
            WindowMode::NewWindow => "-1",
        };
        Command::new("wt")
            .args(["-w", flag, "new-tab", "cmd", "/k", ssh_args])
            .spawn()
            .map_err(|e| e.to_string())
            .map(|_| ())
    }

    #[cfg(target_os = "macos")]
    {
        let script = match mode {
            WindowMode::Tab => format!(
                "tell application \"Terminal\" to activate
                 tell application \"System Events\" to keystroke \"t\" using command down
                 delay 0.2
                 tell application \"Terminal\" to do script \"{}\" in front window",
                ssh_args
            ),
            WindowMode::NewWindow => format!(
                "tell application \"Terminal\" to do script \"{}\"",
                ssh_args
            ),
        };
        Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| e.to_string())
            .map(|_| ())
    }

    #[cfg(target_os = "linux")]
    {
        let flag = match mode {
            WindowMode::Tab => "--tab",
            WindowMode::NewWindow => "--window",
        };
        Command::new("gnome-terminal")
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH") // AppImage対策
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
            .map_err(|e| e.to_string())
            .map(|_| ())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Err("Unsupported OS".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_connection_status,
            check_batch_connections,
            open_ssh_terminal,
            exec_shutdown_command,
            run_system_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
