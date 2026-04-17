use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::info;

#[derive(Debug, Clone)]
pub struct HealthMetrics {
    pub uptime_secs: u64,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub avg_response_time_ms: f64,
    pub total_swap_volume_sol: f64,
    pub total_trades: u64,
    pub active_subscriptions: usize,
    pub memory_usage_mb: u64,
}

impl Default for HealthMetrics {
    fn default() -> Self {
        Self {
            uptime_secs: 0,
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            avg_response_time_ms: 0.0,
            total_swap_volume_sol: 0.0,
            total_trades: 0,
            active_subscriptions: 0,
            memory_usage_mb: 0,
        }
    }
}

pub struct MetricsCollector {
    start_time: Instant,
    total_requests: u64,
    successful_requests: u64,
    failed_requests: u64,
    response_times: Vec<u64>,
    max_response_times: usize,
    total_swap_volume_sol: f64,
    total_trades: u64,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            response_times: Vec::new(),
            max_response_times: 1000,
            total_swap_volume_sol: 0.0,
            total_trades: 0,
        }
    }

    pub fn record_request(&mut self, success: bool, response_time_ms: u64) {
        self.total_requests += 1;
        
        if success {
            self.successful_requests += 1;
        } else {
            self.failed_requests += 1;
        }

        self.response_times.push(response_time_ms);
        if self.response_times.len() > self.max_response_times {
            self.response_times.remove(0);
        }
    }

    pub fn record_swap(&mut self, volume_sol: f64) {
        self.total_swap_volume_sol += volume_sol;
        self.total_trades += 1;
    }

    pub fn get_metrics(&self, active_subscriptions: usize) -> HealthMetrics {
        let uptime = self.start_time.elapsed().as_secs();
        
        let avg_response = if self.response_times.is_empty() {
            0.0
        } else {
            self.response_times.iter().sum::<u64>() as f64 / self.response_times.len() as f64
        };

        let memory = self.get_memory_usage();

        HealthMetrics {
            uptime_secs: uptime,
            total_requests: self.total_requests,
            successful_requests: self.successful_requests,
            failed_requests: self.failed_requests,
            avg_response_time_ms: avg_response,
            total_swap_volume_sol: self.total_swap_volume_sol,
            total_trades: self.total_trades,
            active_subscriptions,
            memory_usage_mb: memory,
        }
    }

    fn get_memory_usage(&self) -> u64 {
        #[cfg(target_os = "windows")]
        {
            0
        }
        #[cfg(not(target_os = "windows"))]
        {
            0
        }
    }

    pub fn get_uptime_string(&self) -> String {
        let elapsed = self.start_time.elapsed();
        let days = elapsed.as_secs() / 86400;
        let hours = (elapsed.as_secs() % 86400) / 3600;
        let minutes = (elapsed.as_secs() % 3600) / 60;
        let seconds = elapsed.as_secs() % 60;

        if days > 0 {
            format!("{}d {}h {}m {}s", days, hours, minutes, seconds)
        } else if hours > 0 {
            format!("{}h {}m {}s", hours, minutes, seconds)
        } else if minutes > 0 {
            format!("{}m {}s", minutes, seconds)
        } else {
            format!("{}s", seconds)
        }
    }

    pub fn get_success_rate(&self) -> f64 {
        if self.total_requests == 0 {
            return 0.0;
        }
        (self.successful_requests as f64 / self.total_requests as f64) * 100.0
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub service: String,
    pub version: String,
    pub uptime: String,
    pub uptime_secs: u64,
    pub healthy: bool,
    pub checks: HealthChecks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthChecks {
    pub websocket: CheckResult,
    pub database: CheckResult,
    pub jito: CheckResult,
    pub rpc: CheckResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub status: String,
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
}

impl HealthStatus {
    pub fn healthy() -> Self {
        Self {
            status: "healthy".to_string(),
            service: "prabu-rust-copy-engine".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            uptime: String::new(),
            uptime_secs: 0,
            healthy: true,
            checks: HealthChecks {
                websocket: CheckResult {
                    status: "ok".to_string(),
                    latency_ms: None,
                    message: None,
                },
                database: CheckResult {
                    status: "ok".to_string(),
                    latency_ms: None,
                    message: None,
                },
                jito: CheckResult {
                    status: "ok".to_string(),
                    latency_ms: None,
                    message: None,
                },
                rpc: CheckResult {
                    status: "ok".to_string(),
                    latency_ms: None,
                    message: None,
                },
            },
        }
    }

    pub fn unhealthy(reason: &str) -> Self {
        Self {
            status: "unhealthy".to_string(),
            service: "prabu-rust-copy-engine".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            uptime: String::new(),
            uptime_secs: 0,
            healthy: false,
            checks: HealthChecks {
                websocket: CheckResult {
                    status: "error".to_string(),
                    latency_ms: None,
                    message: Some(reason.to_string()),
                },
                database: CheckResult {
                    status: "error".to_string(),
                    latency_ms: None,
                    message: Some(reason.to_string()),
                },
                jito: CheckResult {
                    status: "error".to_string(),
                    latency_ms: None,
                    message: Some(reason.to_string()),
                },
                rpc: CheckResult {
                    status: "error".to_string(),
                    latency_ms: None,
                    message: Some(reason.to_string()),
                },
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsResponse {
    pub ok: bool,
    pub metrics: Option<MetricsData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsData {
    pub uptime: String,
    pub uptime_secs: u64,
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub success_rate: f64,
    pub avg_response_time_ms: f64,
    pub total_swap_volume_sol: f64,
    pub total_trades: u64,
    pub active_subscriptions: usize,
}

impl MetricsData {
    pub fn from_metrics(metrics: HealthMetrics, uptime_str: String) -> Self {
        Self {
            uptime: uptime_str,
            uptime_secs: metrics.uptime_secs,
            total_requests: metrics.total_requests,
            successful_requests: metrics.successful_requests,
            failed_requests: metrics.failed_requests,
            success_rate: if metrics.total_requests == 0 {
                0.0
            } else {
                (metrics.successful_requests as f64 / metrics.total_requests as f64) * 100.0
            },
            avg_response_time_ms: metrics.avg_response_time_ms,
            total_swap_volume_sol: metrics.total_swap_volume_sol,
            total_trades: metrics.total_trades,
            active_subscriptions: metrics.active_subscriptions,
        }
    }
}
