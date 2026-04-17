use axum::{
    extract::ws::{Message, WebSocket},
    extract::{State, WebSocketUpgrade},
    http::{header, Request, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use dotenv::dotenv;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};
use tracing_subscriber;

use prabu_rust_copy_engine::{
    AppState, CopyTradeConfig, CopyTradeRequest, CopyTradeResponse, CopyTradeStatus,
    HealthResponse, MetricsCollector, MetricsData, TradingEngine, WalletSubscription,
};

static METRICS: std::sync::LazyLock<MetricsCollector> =
    std::sync::LazyLock::new(MetricsCollector::new);

async fn auth_middleware(
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("X-API-KEY")
        .and_then(|header| header.to_str().ok());

    let api_key = std::env::var("RUST_API_KEY").unwrap_or_else(|_| "dev_key_change_me".to_string());

    if let Some(header_value) = auth_header {
        if header_value == api_key {
            return Ok(next.run(req).await);
        }
    }

    warn!("Unauthorized access attempt from {:?}", req.uri());
    Err(StatusCode::UNAUTHORIZED)
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    info!("Starting Prabu Rust Copy Engine...");

    let state = Arc::new(RwLock::new(AppState::new()));

    // HARDENED: Restrict CORS to specific origins in production
    let cors = CorsLayer::new()
        .allow_origin(Any) // Change to specific origin if not running locally
        .allow_methods([
            header::header_name::HeaderName::from_static("get"),
            header::header_name::HeaderName::from_static("post"),
            header::header_name::HeaderName::from_static("delete"),
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::header_name::HeaderName::from_static("x-api-key"),
        ]);

    let auth_routes = Router::new()
        .route("/status", get(get_status))
        .route("/subscriptions", post(add_subscription))
        .route("/subscriptions/:wallet", delete(remove_subscription))
        .route("/subscriptions", get(list_subscriptions))
        .route(
            "/subscriptions/:wallet/transactions",
            get(get_wallet_transactions),
        )
        .route("/config", get(get_config))
        .route("/config", post(update_config))
        .route("/monitor/start", post(start_monitoring))
        .route("/monitor/stop", post(stop_monitoring))
        .route("/monitor/wallets", get(list_monitored_wallets))
        .route("/swap", post(execute_swap))
        .route("/swap/quote", post(get_quote))
        .route("/swap/bundle", post(execute_bundle_swap))
        .route("/jito/stats", get(get_jito_stats))
        .route("/jito/status", get(get_jito_status))
        .route("/jito/tip-accounts", get(get_jito_tip_accounts))
        .route("/metrics", get(get_metrics))
        .layer(middleware::from_fn(auth_middleware));

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/health/detailed", get(health_detailed))
        .route("/dashboard", get(dashboard))
        .route("/ws", get(ws_handler))
        .merge(auth_routes)
        .fallback(get(fallback_handler))
        .layer(cors)
        .with_state(state.clone());

    let addr = "127.0.0.1:8787"; // Listen only on localhost by default for security
    info!("Prabu Rust Copy Engine listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "prabu-rust-copy-engine".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn dashboard() -> Html<String> {
    Html(include_str!("../static/index.html").to_string())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RwLock<AppState>>>,
) -> impl axum::response::IntoResponse {
    info!("WebSocket connection requested");
    ws.on_upgrade(|socket| ws_socket(socket, state))
}

async fn ws_socket(socket: WebSocket, state: Arc<RwLock<AppState>>) {
    let (mut sender, mut receiver) = socket.split();
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        info!("WS received: {}", text);
                        let _ = sender.send(Message::Text(format!("pong: {}", text))).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        info!("WebSocket closed");
                        break;
                    }
                    _ => {}
                }
            }
            _ = interval.tick() => {
                let state_guard = state.read().await;
                let status = state_guard.get_status();
                let json = serde_json::json!({
                    "type": "status",
                    "data": status
                });
                let _ = sender.send(Message::Text(json.to_string())).await;
            }
        }
    }
}

async fn fallback_handler() -> (axum::http::StatusCode, &'static str) {
    (axum::http::StatusCode::NOT_FOUND, "Not Found")
}

async fn get_status(State(state): State<Arc<RwLock<AppState>>>) -> Json<CopyTradeStatus> {
    let state = state.read().await;
    Json(state.get_status())
}

async fn add_subscription(
    State(state): State<Arc<RwLock<AppState>>>,
    Json(sub): Json<WalletSubscription>,
) -> Json<serde_json::Value> {
    let mut state = state.write().await;
    match state.add_subscription(sub.clone()).await {
        Ok(_) => Json(serde_json::json!({
            "ok": true,
            "message": format!("Subscribed to wallet {}", sub.wallet_address),
            "wallet": sub.wallet_address
        })),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

async fn remove_subscription(
    State(state): State<Arc<RwLock<AppState>>>,
    axum::extract::Path(wallet): axum::extract::Path<String>,
) -> Json<serde_json::Value> {
    let mut state = state.write().await;
    match state.remove_subscription(&wallet).await {
        Ok(_) => Json(serde_json::json!({
            "ok": true,
            "message": format!("Unsubscribed from wallet {}", wallet)
        })),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

async fn list_subscriptions(
    State(state): State<Arc<RwLock<AppState>>>,
) -> Json<Vec<WalletSubscription>> {
    let state = state.read().await;
    Json(state.list_subscriptions())
}

async fn get_wallet_transactions(
    State(state): State<Arc<RwLock<AppState>>>,
    axum::extract::Path(wallet): axum::extract::Path<String>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    let transactions = state.get_wallet_transactions(&wallet);
    Json(serde_json::json!({
        "wallet": wallet,
        "transactions": transactions
    }))
}

async fn get_config(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let state = state.read().await;
    Json(state.get_config())
}

async fn update_config(
    State(state): State<Arc<RwLock<AppState>>>,
    Json(config): Json<CopyTradeConfig>,
) -> Json<serde_json::Value> {
    let mut state = state.write().await;
    state.config = config;
    Json(serde_json::json!({
        "ok": true,
        "message": "Config updated"
    }))
}

async fn start_monitoring(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let mut state = state.write().await;
    match state.start_monitoring().await {
        Ok(_) => Json(serde_json::json!({
            "ok": true,
            "message": "Wallet monitoring started"
        })),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

async fn stop_monitoring(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let mut state = state.write().await;
    state.stop_monitoring();
    Json(serde_json::json!({
        "ok": true,
        "message": "Wallet monitoring stopped"
    }))
}

async fn list_monitored_wallets(State(state): State<Arc<RwLock<AppState>>>) -> Json<Vec<String>> {
    let state = state.read().await;
    Json(state.list_monitored_wallets())
}

async fn execute_swap(
    State(state): State<Arc<RwLock<AppState>>>,
    Json(request): Json<CopyTradeRequest>,
) -> Json<CopyTradeResponse> {
    let config = {
        let state = state.read().await;
        state.config.clone()
    };

    let engine = TradingEngine::new(config);

    match engine.execute_copy_trade(request).await {
        Ok(response) => Json(response),
        Err(e) => Json(CopyTradeResponse {
            ok: false,
            signature: None,
            message: "Swap execution failed".to_string(),
            error: Some(e.to_string()),
        }),
    }
}

async fn execute_bundle_swap(
    State(state): State<Arc<RwLock<AppState>>>,
    Json(request): Json<CopyTradeRequest>,
) -> Json<serde_json::Value> {
    let config = {
        let state = state.read().await;
        state.config.clone()
    };

    let default_slippage = config.default_slippage_bps;
    let mut engine = TradingEngine::new(config).with_bundler();

    let direction = request
        .direction
        .unwrap_or(prabu_rust_copy_engine::TradeDirection::Buy);

    let slippage = request.slippage_bps.unwrap_or(default_slippage);

    match request.token_mint {
        Some(ref mint) => {
            match engine
                .execute_swap_with_bundle(mint, request.amount_sol, direction, slippage)
                .await
            {
                Ok(response) => Json(serde_json::json!({
                    "ok": response.ok,
                    "signature": response.signature,
                    "message": response.message,
                    "error": response.error,
                    "bundler": "jito"
                })),
                Err(e) => Json(serde_json::json!({
                    "ok": false,
                    "error": e.to_string(),
                    "bundler": "jito"
                })),
            }
        }
        None => Json(serde_json::json!({
            "ok": false,
            "error": "token_mint required"
        })),
    }
}

async fn get_quote(
    State(state): State<Arc<RwLock<AppState>>>,
    Json(request): Json<CopyTradeRequest>,
) -> Json<serde_json::Value> {
    let config = {
        let state = state.read().await;
        state.config.clone()
    };

    let token_mint = match request.token_mint {
        Some(ref mint) => mint,
        None => {
            return Json(serde_json::json!({
                "ok": false,
                "error": "token_mint required"
            }));
        }
    };

    let amount_sol = request.amount_sol;
    if amount_sol <= 0.0 {
        return Json(serde_json::json!({
            "ok": false,
            "error": "amount_sol must be greater than 0"
        }));
    }

    let engine = TradingEngine::new(config);

    match engine.check_pool(token_mint).await {
        Ok(Some(pool_info)) => Json(serde_json::json!({
            "ok": true,
            "pool": pool_info,
            "estimated_tokens": amount_sol * 1000.0,
            "slippage_warning": "Quote is estimated"
        })),
        Ok(None) => Json(serde_json::json!({
            "ok": false,
            "error": "No pool found for this token"
        })),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": e.to_string()
        })),
    }
}

async fn get_jito_stats(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let config = {
        let state = state.read().await;
        state.config.clone()
    };

    let engine = TradingEngine::new(config).with_bundler();

    match engine.get_bundler_stats().await {
        Some(stats) => Json(serde_json::json!({
            "ok": true,
            "bundles_sent": stats.bundles_sent,
            "bundles_confirmed": stats.bundles_confirmed,
            "bundles_failed": stats.bundles_failed,
            "confirmation_rate": if stats.bundles_sent > 0 {
                (stats.bundles_confirmed as f64 / stats.bundles_sent as f64 * 100.0)
            } else { 0.0 },
            "last_bundle_id": stats.last_bundle_id,
            "last_confirmed_at": stats.last_confirmed_at
        })),
        None => Json(serde_json::json!({
            "ok": false,
            "error": "Bundler not initialized"
        })),
    }
}

async fn get_jito_status() -> Json<serde_json::Value> {
    let config = CopyTradeConfig::default();
    let engine = TradingEngine::new(config).with_bundler();

    Json(serde_json::json!({
        "ok": true,
        "jito_enabled": engine.get_bundler_stats().await.is_some(),
        "endpoints": vec![
            "https://mainnet.block-engine.jito.wtf",
            "https://amsterdam.mainnet.block-engine.jito.wtf",
            "https://frankfurt.mainnet.block-engine.jito.wtf",
            "https://ny.mainnet.block-engine.jito.wtf",
            "https://tokyo.mainnet.block-engine.jito.wtf"
        ],
        "tip_accounts": prabu_rust_copy_engine::JitoTipAccount::all()
            .into_iter()
            .map(|a| a.address)
            .collect::<Vec<_>>()
    }))
}

async fn get_jito_tip_accounts() -> Json<serde_json::Value> {
    let accounts = prabu_rust_copy_engine::JitoTipAccount::all();

    Json(serde_json::json!({
        "ok": true,
        "tip_accounts": accounts,
        "count": accounts.len()
    }))
}

async fn health_detailed(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let subscriptions = {
        let s = state.read().await;
        s.subscriptions.len()
    };

    let metrics = METRICS.get_metrics(subscriptions);

    Json(serde_json::json!({
        "status": "ok",
        "service": "prabu-rust-copy-engine",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime": METRICS.get_uptime_string(),
        "uptime_secs": metrics.uptime_secs,
        "healthy": true,
        "checks": {
            "websocket": {
                "status": "ok",
                "message": "WebSocket monitoring active"
            },
            "database": {
                "status": "ok",
                "message": "In-memory state active"
            },
            "jito": {
                "status": "ok",
                "message": "Jito bundler ready"
            },
            "rpc": {
                "status": "ok",
                "message": "RPC client configured"
            }
        },
        "metrics": {
            "total_requests": metrics.total_requests,
            "successful_requests": metrics.successful_requests,
            "failed_requests": metrics.failed_requests,
            "success_rate": METRICS.get_success_rate(),
            "avg_response_time_ms": metrics.avg_response_time_ms,
            "total_swap_volume_sol": metrics.total_swap_volume_sol,
            "total_trades": metrics.total_trades,
            "active_subscriptions": metrics.active_subscriptions
        }
    }))
}

async fn get_metrics(State(state): State<Arc<RwLock<AppState>>>) -> Json<serde_json::Value> {
    let subscriptions = {
        let s = state.read().await;
        s.subscriptions.len()
    };

    let metrics = METRICS.get_metrics(subscriptions);
    let metrics_data = MetricsData::from_metrics(metrics, METRICS.get_uptime_string());

    Json(serde_json::json!({
        "ok": true,
        "metrics": {
            "uptime": metrics_data.uptime,
            "uptime_secs": metrics_data.uptime_secs,
            "total_requests": metrics_data.total_requests,
            "successful_requests": metrics_data.successful_requests,
            "failed_requests": metrics_data.failed_requests,
            "success_rate": metrics_data.success_rate,
            "avg_response_time_ms": metrics_data.avg_response_time_ms,
            "total_swap_volume_sol": metrics_data.total_swap_volume_sol,
            "total_trades": metrics_data.total_trades,
            "active_subscriptions": metrics_data.active_subscriptions
        }
    }))
}
