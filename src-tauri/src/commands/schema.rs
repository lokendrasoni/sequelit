use crate::db::{describe_table, list_schemas, list_tables, open_pool};
use crate::db::types::*;
use crate::AppState;
use sqlx::Row;

// ---------------------------------------------------------------------------
// Pool resolution helpers
// ---------------------------------------------------------------------------

/// Returns the db_type string for a connection.
async fn get_db_type(
    connection_id: &str,
    state: &tauri::State<'_, AppState>,
) -> Result<String, String> {
    let row = sqlx::query("SELECT db_type FROM connections WHERE id = ?")
        .bind(connection_id)
        .fetch_one(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.try_get("db_type").unwrap_or_default())
}

/// Returns the pool and db_type for the given connection + optional database override.
/// When `database` is None, returns the existing connected pool directly.
/// When `database` is Some, creates or returns a cached browse pool for that database.
async fn resolve_pool(
    connection_id: &str,
    database: Option<&str>,
    state: &tauri::State<'_, AppState>,
) -> Result<(sqlx::AnyPool, String), String> {
    let db_type = get_db_type(connection_id, state).await?;

    let Some(database) = database else {
        // No override — use the main connected pool.
        let pool = state
            .db_pools
            .lock()
            .unwrap()
            .get(connection_id)
            .ok_or("Not connected")?
            .clone();
        return Ok((pool, db_type));
    };

    let cache_key = format!("{}::{}", connection_id, database);

    // Return cached browse pool if available.
    if let Some(pool) = state.browse_pools.lock().unwrap().get(&cache_key) {
        return Ok((pool.clone(), db_type.clone()));
    }

    // Build a new pool for this database using stored credentials.
    let row = sqlx::query(
        "SELECT host, port, username, ssl_mode FROM connections WHERE id = ?",
    )
    .bind(connection_id)
    .fetch_one(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    let host: Option<String> = row.try_get("host").unwrap_or(None);
    let port: Option<i64> = row.try_get("port").unwrap_or(None);
    let username: Option<String> = row.try_get("username").unwrap_or(None);

    // Decrypt password.
    let password = {
        let secret = sqlx::query(
            "SELECT encrypted_blob FROM connection_secrets WHERE connection_id = ?",
        )
        .bind(connection_id)
        .fetch_optional(&state.config_pool)
        .await
        .ok()
        .flatten();

        if let Some(r) = secret {
            let blob: String = r.try_get("encrypted_blob").unwrap_or_default();
            crate::crypto::decrypt(&blob, &state.encryption_key)
                .ok()
                .and_then(|d| serde_json::from_str::<serde_json::Value>(&d).ok())
                .and_then(|j| j["password"].as_str().map(|s| s.to_string()))
        } else {
            None
        }
    };

    // If an SSH tunnel is active for this connection, use its local port.
    let (eff_host, eff_port) = {
        let ssh_port = state.ssh_ports.lock().unwrap().get(connection_id).copied();
        if let Some(lport) = ssh_port {
            ("127.0.0.1".to_string(), Some(lport))
        } else {
            (
                host.unwrap_or_else(|| "localhost".to_string()),
                port.map(|p| p as u16),
            )
        }
    };

    let db_type_enum = match db_type.as_str() {
        "postgres"    => DbType::Postgres,
        "mysql"       => DbType::Mysql,
        "cockroachdb" => DbType::Cockroachdb,
        "redshift"    => DbType::Redshift,
        _             => DbType::Sqlite,
    };

    let config = ConnectionConfig {
        id: None,
        name: String::new(),
        db_type: db_type_enum,
        host: Some(eff_host),
        port: eff_port,
        database: Some(database.to_string()),
        username,
        password,
        ssl_mode: None,
        ssh_host: None, // tunnel already handled above
        ssh_user: None,
        ssh_port: None,
        ssh_key_path: None,
        color_tag: None,
        group_name: None,
        read_only: None,
    };

    let pool = open_pool(&config.build_url())
        .await
        .map_err(|e| e.to_string())?;

    state
        .browse_pools
        .lock()
        .unwrap()
        .insert(cache_key, pool.clone());

    Ok((pool, db_type))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_databases(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let pool = state
        .db_pools
        .lock()
        .unwrap()
        .get(&connection_id)
        .ok_or("Not connected")?
        .clone();

    let db_type = get_db_type(&connection_id, &state).await?;

    let sql = match db_type.as_str() {
        "postgres" | "cockroachdb" | "redshift" => {
            "SELECT datname::text FROM pg_database WHERE datistemplate = false ORDER BY datname"
        }
        "mysql" => {
            "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
        }
        _ => return Ok(vec![]),
    };

    let rows = sqlx::query(sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

#[tauri::command]
pub async fn get_schemas(
    connection_id: String,
    database: Option<String>,
    show_system: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let (pool, db_type) = resolve_pool(&connection_id, database.as_deref(), &state).await?;
    list_schemas(&pool, &db_type, show_system.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    schema: String,
    database: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TableInfo>, String> {
    let (pool, db_type) = resolve_pool(&connection_id, database.as_deref(), &state).await?;
    list_tables(&pool, &db_type, &schema)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_table_detail(
    connection_id: String,
    schema: String,
    table: String,
    database: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<TableDetail, String> {
    let (pool, db_type) = resolve_pool(&connection_id, database.as_deref(), &state).await?;
    describe_table(&pool, &db_type, &schema, &table)
        .await
        .map_err(|e| e.to_string())
}
