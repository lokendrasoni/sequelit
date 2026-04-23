use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub sql: String,
    pub schedule: String, // cron expression
    pub enabled: bool,
    pub last_run: Option<String>,
    pub last_status: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn get_jobs(state: tauri::State<'_, AppState>) -> Result<Vec<Job>, String> {
    let rows = sqlx::query(
        "SELECT id, connection_id, name, sql, schedule, enabled,
                last_run, last_status, created_at
         FROM jobs ORDER BY name",
    )
    .fetch_all(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| Job {
        id: r.try_get("id").unwrap_or_default(),
        connection_id: r.try_get("connection_id").unwrap_or(None),
        name: r.try_get("name").unwrap_or_default(),
        sql: r.try_get("sql").unwrap_or_default(),
        schedule: r.try_get("schedule").unwrap_or_default(),
        enabled: r.try_get::<i64, _>("enabled").unwrap_or(0) != 0,
        last_run: r.try_get("last_run").unwrap_or(None),
        last_status: r.try_get("last_status").unwrap_or(None),
        created_at: r.try_get("created_at").unwrap_or_default(),
    }).collect())
}

#[derive(Debug, Deserialize)]
pub struct SaveJobInput {
    pub id: Option<String>,
    pub connection_id: Option<String>,
    pub name: String,
    pub sql: String,
    pub schedule: String,
    pub enabled: bool,
}

#[tauri::command]
pub async fn save_job(
    input: SaveJobInput,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO jobs (id, connection_id, name, sql, schedule, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           connection_id=excluded.connection_id,
           name=excluded.name, sql=excluded.sql,
           schedule=excluded.schedule, enabled=excluded.enabled",
    )
    .bind(&id)
    .bind(&input.connection_id)
    .bind(&input.name)
    .bind(&input.sql)
    .bind(&input.schedule)
    .bind(if input.enabled { 1i64 } else { 0i64 })
    .bind(&now)
    .execute(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn delete_job(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM jobs WHERE id = ?")
        .bind(&id)
        .execute(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_job(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE jobs SET enabled = ? WHERE id = ?")
        .bind(if enabled { 1i64 } else { 0i64 })
        .bind(&id)
        .execute(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn run_job_now(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Fetch the job
    let row = sqlx::query(
        "SELECT connection_id, sql FROM jobs WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    let conn_id: Option<String> = row.try_get("connection_id").unwrap_or(None);
    let sql: String = row.try_get("sql").unwrap_or_default();

    let result = if let Some(cid) = conn_id {
        let pool = {
            let pools = state.db_pools.lock().unwrap();
            pools.get(&cid).cloned()
        };
        if let Some(p) = pool {
            match crate::db::execute_query(&p, &sql).await {
                r if r.error.is_none() => {
                    format!("OK: {} rows affected", r.rows_affected)
                }
                r => format!("ERROR: {}", r.error.unwrap_or_default()),
            }
        } else {
            "ERROR: connection not open".to_string()
        }
    } else {
        "ERROR: no connection assigned".to_string()
    };

    let now = Utc::now().to_rfc3339();
    let _ = sqlx::query("UPDATE jobs SET last_run = ?, last_status = ? WHERE id = ?")
        .bind(&now)
        .bind(&result)
        .bind(&id)
        .execute(&state.config_pool)
        .await;

    Ok(result)
}
