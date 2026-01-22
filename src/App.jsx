import React, { useEffect, useState, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// --- Constants ---
const MASTER_CONFIG = [
  // Computers (sshName: SSH接続時のホスト名, uiName: UI表示名)
  // type: "computer" は操作対象のPC群
  { type: "computer", sshName: "localhost",     uiName: "localhost",   ip: "127.0.0.1",      allowRos: true },
  { type: "computer", sshName: "kyubic_main",   uiName: "Main PC",     ip: "192.168.50.101", allowRos: true },
  { type: "computer", sshName: "kyubic_jetson", uiName: "Jetson",      ip: "192.168.9.110",  allowRos: false },
  { type: "computer", sshName: "kyubic_rpi5",   uiName: "RPi 5",       ip: "192.168.9.120",  allowRos: false },

  // Other Devices (監視対象のみ)
  { type: "device",   uiName: "Sensor (ESP32)", ip: "192.168.9.5" },
  { type: "device",   uiName: "DVL",            ip: "192.168.9.10" },
  { type: "device",   uiName: "GNSS",           ip: "192.168.9.20" },
  { type: "device",   uiName: "Main KVM",       ip: "192.168.9.105" },
  { type: "device",   uiName: "Jetson KVM",     ip: "192.168.9.115" },
];

// --- Derived Constants ---

// 操作タブ用のリスト (変数名を ROBOTS -> COMPUTERS に変更)
export const COMPUTERS = MASTER_CONFIG
  .filter(item => item.type === "computer")
  .map(item => ({
    name: item.sshName,      // SSH接続等で使うホスト名
    displayName: item.uiName,// タブに表示する名前
    ip: item.ip,             // 一意なキーとして使用
    allowRos: item.allowRos
  }));

// ステータス一覧用の全リスト
export const ALL_DEVICES = MASTER_CONFIG
  .map(item => ({
    name: item.uiName,       // 一覧ではわかりやすいUI名を表示
    ip: item.ip
  }));

// --- Custom Hooks ---
const useBodyScrollLock = () => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
};

const useDeviceMonitor = (devices, intervalMs = 5000) => {
  const [deviceStatus, setDeviceStatus] = useState({});

  const updateStatuses = useCallback(async () => {
    // 127.0.0.1 以外のIPリストを作成
    const targets = devices
      .filter(d => d.ip !== "127.0.0.1")
      .map(d => d.ip);

    try {
      // ★ ここで一回だけRustを呼び出す
      const result = await invoke("check_batch_connections", { targets });
      
      // localhostは常にtrueとしてマージ
      const nextStatus = { ...result, "127.0.0.1": true };

      setDeviceStatus(prev => {
        if (JSON.stringify(prev) === JSON.stringify(nextStatus)) return prev;
        return nextStatus;
      });
    } catch (e) {
      console.error("Monitor failed:", e);
    }
  }, [devices]);

  useEffect(() => {
    updateStatuses();
    const id = setInterval(updateStatuses, intervalMs);
    return () => clearInterval(id);
  }, [updateStatuses, intervalMs]);

  return deviceStatus;
};

// --- Sub Components ---

const StatusChip = memo(({ device, isOnline }) => (
  <div className={`status-chip ${isOnline ? "chip-online" : "chip-offline"}`} title={device.ip}>
    <span className={`status-icon ${isOnline ? "online" : "offline"}`}>●</span>
    <span className="chip-name">{device.name}</span>
  </div>
));

const NetworkStatusGrid = memo(({ devices, statuses }) => (
  <div className="status-overview">
    <h3 className="section-title">Network Status</h3>
    <div className="status-grid">
      {devices.map(d => d.ip !== "127.0.0.1" && (
        <StatusChip key={d.ip} device={d} isOnline={!!statuses[d.ip]} />
      ))}
    </div>
  </div>
));

const CheckItemCard = memo(({ item }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isPass = item.status === "PASS";
  const hasDetails = !!item.details;

  return (
    <div className={`check-item-card ${isPass ? "border-pass" : "border-fail"}`}>
      <div className="check-item-header" onClick={() => hasDetails && setIsOpen(!isOpen)}>
        <span className={`check-item-badge ${isPass ? "text-success" : "text-danger"}`}>
          {item.status}
        </span>
        <div className="check-item-text-wrapper">
          <span className="check-item-desc">{item.description}</span>
          <span className="check-item-name">{item.name}</span>
        </div>
        {hasDetails && <div className={`accordion-chevron ${isOpen ? "open" : ""}`}>▼</div>}
      </div>
      {isOpen && hasDetails && <div className="check-item-details">{item.details}</div>}
    </div>
  );
});

const CheckResultModal = memo(({ result, onClose }) => {
  useBodyScrollLock();
  const [showPassItems, setShowPassItems] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  const fails = result?.summary.filter(i => i.status === "FAIL") || [];
  const passes = result?.summary.filter(i => i.status === "PASS") || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">System Health Report</h3>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="summary-grid">
            <div className={`summary-card ${fails.length ? 'fail' : 'pass'}`} style={{ opacity: fails.length ? 1 : 0.5 }}>
              <span className="summary-count">{fails.length}</span>
              <span className="summary-label">Issues Found</span>
            </div>
            <div className="summary-card pass">
              <span className="summary-count">{passes.length}</span>
              <span className="summary-label">Checks Passed</span>
            </div>
          </div>
          
          {fails.length > 0 && (
            <div className="section-container">
              <h4 className="critical-header">⚠️ CRITICAL ISSUES</h4>
              {fails.map((item, idx) => <CheckItemCard key={`fail-${idx}`} item={item} />)}
            </div>
          )}
          
          {passes.length > 0 && (
            <div className="section-container">
              <button onClick={() => setShowPassItems(!showPassItems)} className="accordion-button">
                <span>Passed Checks</span>
                <span className="count-badge">{passes.length}</span>
              </button>
              {showPassItems && <div className="passed-list">{passes.map((item, idx) => <CheckItemCard key={`pass-${idx}`} item={item} />)}</div>}
            </div>
          )}

          <div className="log-section">
            <button onClick={() => setShowDetails(!showDetails)} className="text-link-button">
              {showDetails ? "▼ Hide Raw Log" : "▶ Show Raw Log"}
            </button>
            {showDetails && <pre className="log-viewer">{result.detailed || "No detailed report."}</pre>}
          </div>
        </div>
        <div className="modal-actions">
          <button className="modal-button confirm primary-bg" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
});

const ShutdownModal = memo(({ target, onConfirm, onCancel }) => {
  useBodyScrollLock();
  if (!target) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-compact" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title text-danger">⚠️ Shutdown Confirmation</h3>
        <p className="modal-message">
          Are you sure you want to turn off<br />
          <strong className="text-strong">{target.name}</strong>?
        </p>
        <div className="modal-actions">
          <button className="modal-button cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-button confirm danger-bg" onClick={onConfirm}>Shutdown</button>
        </div>
      </div>
    </div>
  );
});

// --- Main App ---
function App() {
  const isLinux = navigator.userAgent.toLowerCase().includes("linux");
  const deviceStatus = useDeviceMonitor(ALL_DEVICES);
  const [activeTab, setActiveTab] = useState(0);
  const [shutdownTarget, setShutdownTarget] = useState(null);
  const [inputIp, setInputIp] = useState(isLinux ? "localhost" : "192.168.9.100");
  const [checkResult, setCheckResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const currentRobot = COMPUTERS[activeTab];
  const isOnline = !!deviceStatus[currentRobot.ip];
  
  // Logic for System Check Widget
  const mainRobot = COMPUTERS.find(r => r.name === "kyubic_main");
  const isMainOnline = !!deviceStatus[mainRobot.ip];
  const failCount = checkResult?.summary.filter(i => i.status === "FAIL").length || 0;
  const passCount = checkResult?.summary.filter(i => i.status === "PASS").length || 0;

  const handleLaunchSSH = useCallback(async (robot, useRos) => {
    try {
      const commandStr = "ros2_start -- bash -i -c byobu";
      await invoke("open_ssh_terminal", { 
        hostname: robot.name, 
        ip: robot.ip, 
        runRos: useRos, 
        remoteCommand: useRos ? commandStr : "" 
      });
    } catch (e) { alert(`Error: ${e}`); }
  }, []);

  const executeShutdown = useCallback(async () => {
    if (!shutdownTarget) return;
    try {
      await invoke("exec_shutdown_command", { hostname: shutdownTarget.name });
      setShutdownTarget(null);
    } catch (e) { alert(`Error: ${e}`); }
  }, [shutdownTarget]);

  const handleSystemCheck = useCallback(async () => {
    setIsChecking(true); setCheckResult(null);
    try {
      const report = await invoke("run_system_check", { hostname: "kyubic_main" });
      setCheckResult(report);
    } catch (e) { alert(`Error: ${e}`); }
    finally { setIsChecking(false); }
  }, []);

  // Determine button state for System Check
  let checkBtnProps = { icon: "🛡️", text: "RUN CHECK", disabled: false };
  if (isChecking) checkBtnProps = { icon: "⏳", text: "CHECKING...", disabled: true };
  else if (!isMainOnline) checkBtnProps = { icon: "🚫", text: "OFFLINE", disabled: true };

  return (
    <div className="container">
      <NetworkStatusGrid devices={ALL_DEVICES} statuses={deviceStatus} />
      <div className="divider" />

    <h3 className="section-title">Computers</h3> {/* タイトルも変更 */}
      <div className="tabs">
        {COMPUTERS.map((comp, idx) => ( // ROBOTS -> COMPUTERS
          (comp.ip !== "127.0.0.1" || isLinux) && (
            <button 
              key={comp.ip} // idの代わりに ip をkeyにする
              className={`tab-button ${idx === activeTab ? "active" : ""}`} 
              onClick={() => setActiveTab(idx)}
            >
              <span className={`status-icon ${deviceStatus[comp.ip] ? "online" : "offline"}`}>●</span>
              {/* sshName(name) ではなく uiName(displayName) を表示 */}
              {comp.displayName}
            </button>
          )
        ))}
      </div>

      <div className={`tab-content ${isOnline ? "online-mode" : "offline-mode"}`}>
        <div className="content-header">
          <div><h2 className="robot-title">{currentRobot.name}</h2><span className="robot-ip">{currentRobot.ip}</span></div>
          <div className="header-controls">
            {isOnline && <button className="header-icon-button" onClick={() => setShutdownTarget(currentRobot)} title="Shutdown">⏻</button>}
            <div className={`status-badge ${isOnline ? "badge-online" : "badge-offline"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</div>
          </div>
        </div>
        <div className="button-group">
          {isOnline ? (
            <>
              <button className="action-button secondary" onClick={() => handleLaunchSSH(currentRobot, false)}><span className="icon">💻</span> Terminal</button>
              {currentRobot.allowRos && <button className="action-button primary" onClick={() => handleLaunchSSH(currentRobot, true)}><span className="icon">🚀</span> Docker & ROS</button>}
            </>
          ) : (
            <div className="loading-container"><div className="spinner"></div><p>Searching...</p></div>
          )}
        </div>
      </div>

      <div className="divider" />
      
      <div className="system-check-section">
        <h3 className="section-title">System Diagnostics</h3>
        <div className="hud-control-wrapper">
          <button className="hud-run-button" onClick={handleSystemCheck} disabled={checkBtnProps.disabled}>
            <span className="hud-btn-icon">{checkBtnProps.icon}</span>
            <span className="hud-btn-text">{checkBtnProps.text}</span>
          </button>
          {checkResult && !isChecking && (
            <div className={`hud-status-card ${failCount > 0 ? "danger" : "success"}`} onClick={() => setIsReportOpen(true)}>
              <div className={`hud-metric ${failCount > 0 ? "metric-danger" : "metric-dimmed"}`}>
                <div className="metric-icon">⚠️</div>
                <div className="metric-content"><span className="metric-label">FAIL</span><span className="metric-value">{failCount}</span></div>
              </div>
              <div className="hud-divider"></div>
              <div className="hud-metric metric-success">
                <div className="metric-icon">✅</div>
                <div className="metric-content"><span className="metric-label">PASS</span><span className="metric-value">{passCount}</span></div>
              </div>
              <div className="hud-arrow">details ↗</div>
            </div>
          )}
        </div>
      </div>

      <div className="divider" />

      <h3 className="section-title">Web Tools</h3>
      <div className="web-tools-card-horizontal">
        <div className="input-container-compact"><span className="input-prefix">http://</span><input type="text" className="ip-input-enhanced" value={inputIp} onChange={(e) => setInputIp(e.target.value)} /></div>
        <a href={`http://${inputIp}:8080`} target="_blank" rel="noopener noreferrer" className="web-btn-sm dashboard-btn">📊 Dashboard</a>
        <a href={`http://${inputIp}:8081`} target="_blank" rel="noopener noreferrer" className="web-btn-sm viewer-btn">🧊 3D Viewer</a>
      </div>

      {shutdownTarget && <ShutdownModal target={shutdownTarget} onConfirm={executeShutdown} onCancel={() => setShutdownTarget(null)} />}
      {isReportOpen && checkResult && <CheckResultModal result={checkResult} onClose={() => setIsReportOpen(false)} />}
    </div>
  );
}

export default App;
