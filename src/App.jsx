import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// =========================================
// 1. Constants & Configuration
// =========================================

// Target robots for the main control tabs
const ROBOTS = [
  { id: "main", name: "kyubic_main", ip: "192.168.9.100", allowRos: true },
  { id: "jetson", name: "kyubic_jetson", ip: "192.168.9.110", allowRos: false },
  { id: "rpi5", name: "kyubic_rpi5", ip: "192.168.9.120", allowRos: false },
];

// List of all devices to monitor in the status overview
const ALL_DEVICES = [
  { name: "Sensor (ESP32)", ip: "192.168.9.5" },
  { name: "DVL", ip: "192.168.9.10" },
  { name: "GNSS", ip: "192.168.9.20" },
  { name: "Main PC", ip: "192.168.9.100" },
  { name: "Main KVM", ip: "192.168.9.105" },
  { name: "Jetson", ip: "192.168.9.110" },
  { name: "Jetson KVM", ip: "192.168.9.115" },
  { name: "RPi 5", ip: "192.168.9.120" },
];

// =========================================
// 2. Main Component
// =========================================

function App() {
  // --- State Management ---
  const [activeTab, setActiveTab] = useState(0);
  const [deviceStatus, setDeviceStatus] = useState({});
  const [shutdownTarget, setShutdownTarget] = useState(null);

  // --- Effects ---
  useEffect(() => {
    // Initial check
    updateAllStatuses();

    // Polling every 5 seconds
    const intervalId = setInterval(updateAllStatuses, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // --- Helpers & Handlers ---

  // Ping all devices to update status
  const updateAllStatuses = () => {
    ALL_DEVICES.forEach(async (device) => {
      try {
        const isOnline = await invoke("check_connection_status", { target: device.ip });
        setDeviceStatus((prev) => ({ ...prev, [device.ip]: isOnline }));
      } catch (error) {
        setDeviceStatus((prev) => ({ ...prev, [device.ip]: false }));
      }
    });
  };

  // Launch SSH Terminal (Normal or ROS/Docker)
  const handleLaunchSSH = async (robot, useRos) => {
    try {
      const commandStr = "ros2_start -- bash -i -c byobu";
      await invoke("open_ssh_terminal", {
        hostname: robot.name,
        ip: robot.ip,
        runRos: useRos,
        remoteCommand: useRos ? commandStr : "",
      });
    } catch (e) {
      alert(`Terminal Launch Error: ${e}`);
    }
  };

  // Execute Shutdown Command
  const executeShutdown = async () => {
    if (!shutdownTarget) return;

    try {
      await invoke("exec_shutdown_command", { hostname: shutdownTarget.name });
      setShutdownTarget(null); // Close modal
    } catch (e) {
      alert(`Shutdown Error: ${e}`);
    }
  };

  // Derived state for current view
  const currentRobot = ROBOTS[activeTab];
  const isCurrentRobotOnline = deviceStatus[currentRobot.ip];

  // --- Render ---
  return (
    <div className="container">
      
      {/* 1. Network Status Overview */}
      <div className="status-overview">
        <h3 className="section-title">Network Status</h3>
        <div className="status-grid">
          {ALL_DEVICES.map((device) => {
            const isOnline = deviceStatus[device.ip];
            return (
              <div 
                key={device.ip} 
                className={`status-chip ${isOnline ? "chip-online" : "chip-offline"}`}
                title={device.ip}
              >
                <span className={`status-icon ${isOnline ? "online" : "offline"}`}>
                  {isOnline ? "●" : "○"}
                </span>
                <span className="chip-name">{device.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="divider"></div>

      {/* 2. Robot Control Section */}
      <h3 className="section-title">Connect Computer</h3>
      
      {/* Tab Navigation */}
      <div className="tabs">
        {ROBOTS.map((robot, index) => {
          const robotOnline = deviceStatus[robot.ip];
          return (
            <button
              key={robot.id}
              className={`tab-button ${index === activeTab ? "active" : ""} ${robotOnline ? "tab-online" : ""}`}
              onClick={() => setActiveTab(index)}
            >
              <span className={`status-icon ${robotOnline ? "online" : "offline"}`}>
                {robotOnline ? "●" : "○"}
              </span>
              {robot.name}
            </button>
          );
        })}
      </div>

      {/* Main Control Panel (Card) */}
      <div className={`tab-content ${isCurrentRobotOnline ? "online-mode" : "offline-mode"}`}>
        
        {/* Header: Name, IP, Actions */}
        <div className="content-header">
          <div className="header-left">
            <h2 className="robot-title">{currentRobot.name}</h2>
            <span className="robot-ip">{currentRobot.ip}</span>
          </div>

          <div className="header-right">
            {/* Shutdown Button (Icon) */}
            {isCurrentRobotOnline && (
              <button 
                className="header-icon-button circle-danger"
                onClick={() => setShutdownTarget(currentRobot)}
                title="Shutdown this device"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="18" height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="3.0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                  <line x1="12" y1="2" x2="12" y2="12"></line>
                </svg>
              </button>
            )}

            {/* Status Badge */}
            <div className={`status-badge ${isCurrentRobotOnline ? "badge-online" : "badge-offline"}`}>
              {isCurrentRobotOnline ? "📡 ONLINE" : "⏳ CONNECTING..."}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="button-group">
          {isCurrentRobotOnline ? (
            <>
              <button className="action-button secondary" onClick={() => handleLaunchSSH(currentRobot, false)}>
                <span className="icon">💻</span> Terminal
              </button>

              {currentRobot.allowRos && (
                <button className="action-button primary" onClick={() => handleLaunchSSH(currentRobot, true)}>
                  <span className="icon">🚀</span> Docker & ROS
                </button>
              )}
            </>
          ) : (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Searching for device...</p>
            </div>
          )}
        </div>
      </div>

      {/* Shutdown Confirmation Modal */}
      {shutdownTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">⚠️ Confirm Shutdown</h3>
            <p className="modal-message">
              Are you sure you want to shutdown <strong>{shutdownTarget.name}</strong>?<br/>
              ({shutdownTarget.ip})
            </p>
            <div className="modal-actions">
              <button className="modal-button cancel" onClick={() => setShutdownTarget(null)}>
                Cancel
              </button>
              <button className="modal-button confirm" onClick={executeShutdown}>
                Shutdown Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
