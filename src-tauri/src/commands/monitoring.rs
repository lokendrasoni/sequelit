use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize)]
pub struct PgActivity {
    pub pid: i32,
    pub usename: String,
    pub application_name: String,
    pub client_addr: Option<String>,
    pub state: Option<String>,
    pub wait_event: Option<String>,
    pub wait_event_type: Option<String>,
    pub query: Option<String>,
    pub duration_sec: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub active_count: i64,
    pub idle_count: i64,
    pub idle_tx_count: i64,
    pub waiting_count: i64,
    pub total_backends: i64,
    pub xact_commit: i64,
    pub xact_rollback: i64,
    pub blks_read: i64,
    pub blks_hit: i64,
    pub tup_inserted: i64,
    pub tup_updated: i64,
    pub tup_deleted: i64,
    pub tup_fetched: i64,
    pub cache_hit_ratio: f64,
    pub locks_waiting: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LockInfo {
    pub pid: i32,
    pub usename: String,
    pub query: String,
    pub lock_type: String,
    pub relation_name: Option<String>,
    pub granted: bool,
}

#[tauri::command]
pub async fn get_pg_activity(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PgActivity>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT pid, usename::text, application_name, client_addr::text,
                state, wait_event, wait_event_type,
                query,
                EXTRACT(EPOCH FROM (now() - query_start))::bigint AS duration_sec
         FROM pg_stat_activity
         WHERE pid != pg_backend_pid()
         ORDER BY duration_sec DESC NULLS LAST",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| PgActivity {
        pid: r.try_get("pid").unwrap_or(0),
        usename: r.try_get("usename").unwrap_or_default(),
        application_name: r.try_get("application_name").unwrap_or_default(),
        client_addr: r.try_get("client_addr").unwrap_or(None),
        state: r.try_get("state").unwrap_or(None),
        wait_event: r.try_get("wait_event").unwrap_or(None),
        wait_event_type: r.try_get("wait_event_type").unwrap_or(None),
        query: r.try_get("query").unwrap_or(None),
        duration_sec: r.try_get("duration_sec").unwrap_or(None),
    }).collect())
}

#[tauri::command]
pub async fn cancel_backend(
    connection_id: String,
    pid: i32,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let row = sqlx::query("SELECT pg_cancel_backend($1) AS result")
        .bind(pid)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.try_get::<bool, _>("result").unwrap_or(false))
}

#[tauri::command]
pub async fn terminate_backend(
    connection_id: String,
    pid: i32,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let row = sqlx::query("SELECT pg_terminate_backend($1) AS result")
        .bind(pid)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.try_get::<bool, _>("result").unwrap_or(false))
}

#[tauri::command]
pub async fn get_dashboard_stats(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<DashboardStats, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    // Activity state counts
    let state_rows = sqlx::query(
        "SELECT COALESCE(state, 'unknown') AS state, count(*)::bigint AS cnt
         FROM pg_stat_activity WHERE pid != pg_backend_pid()
         GROUP BY state",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut active = 0i64;
    let mut idle = 0i64;
    let mut idle_tx = 0i64;
    let mut total = 0i64;
    for row in &state_rows {
        let s: String = row.try_get("state").unwrap_or_default();
        let cnt: i64 = row.try_get("cnt").unwrap_or(0);
        total += cnt;
        match s.as_str() {
            "active" => active = cnt,
            "idle" => idle = cnt,
            "idle in transaction" => idle_tx = cnt,
            _ => {}
        }
    }

    // Waiting locks
    let lock_row = sqlx::query(
        "SELECT count(*)::bigint AS cnt FROM pg_locks WHERE NOT granted",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;
    let waiting = lock_row.try_get::<i64, _>("cnt").unwrap_or(0);

    // DB stats
    let db_row = sqlx::query(
        "SELECT xact_commit::bigint, xact_rollback::bigint,
                blks_read::bigint, blks_hit::bigint,
                tup_inserted::bigint, tup_updated::bigint,
                tup_deleted::bigint, tup_fetched::bigint,
                numbackends::bigint
         FROM pg_stat_database WHERE datname = current_database()",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let blks_read: i64 = db_row.try_get("blks_read").unwrap_or(0);
    let blks_hit: i64 = db_row.try_get("blks_hit").unwrap_or(0);
    let cache_hit = if blks_read + blks_hit > 0 {
        blks_hit as f64 / (blks_read + blks_hit) as f64 * 100.0
    } else {
        100.0
    };

    Ok(DashboardStats {
        active_count: active,
        idle_count: idle,
        idle_tx_count: idle_tx,
        waiting_count: waiting,
        total_backends: total,
        xact_commit: db_row.try_get("xact_commit").unwrap_or(0),
        xact_rollback: db_row.try_get("xact_rollback").unwrap_or(0),
        blks_read,
        blks_hit,
        tup_inserted: db_row.try_get("tup_inserted").unwrap_or(0),
        tup_updated: db_row.try_get("tup_updated").unwrap_or(0),
        tup_deleted: db_row.try_get("tup_deleted").unwrap_or(0),
        tup_fetched: db_row.try_get("tup_fetched").unwrap_or(0),
        cache_hit_ratio: cache_hit,
        locks_waiting: waiting,
    })
}

#[tauri::command]
pub async fn get_table_stats(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT schemaname::text, relname::text AS table_name,
                n_live_tup::bigint, n_dead_tup::bigint,
                seq_scan::bigint, idx_scan::bigint,
                last_vacuum::text, last_autovacuum::text,
                last_analyze::text, last_autoanalyze::text,
                pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) AS total_size
         FROM pg_stat_user_tables WHERE schemaname = $1
         ORDER BY n_live_tup DESC",
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| serde_json::json!({
        "table_name": r.try_get::<String, _>("table_name").unwrap_or_default(),
        "n_live_tup": r.try_get::<i64, _>("n_live_tup").unwrap_or(0),
        "n_dead_tup": r.try_get::<i64, _>("n_dead_tup").unwrap_or(0),
        "seq_scan": r.try_get::<i64, _>("seq_scan").unwrap_or(0),
        "idx_scan": r.try_get::<i64, _>("idx_scan").unwrap_or(0),
        "last_vacuum": r.try_get::<Option<String>, _>("last_vacuum").unwrap_or(None),
        "last_autovacuum": r.try_get::<Option<String>, _>("last_autovacuum").unwrap_or(None),
        "total_size": r.try_get::<String, _>("total_size").unwrap_or_default(),
    })).collect())
}
