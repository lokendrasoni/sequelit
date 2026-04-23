use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub sql: String,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn save_query(
    connection_id: Option<String>,
    name: String,
    sql: String,
    description: Option<String>,
    tags: Option<String>,
    existing_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO saved_queries (id, connection_id, name, sql, description, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, sql=excluded.sql, description=excluded.description,
           tags=excluded.tags, connection_id=excluded.connection_id, updated_at=excluded.updated_at",
    )
    .bind(&id)
    .bind(&connection_id)
    .bind(&name)
    .bind(&sql)
    .bind(&description)
    .bind(&tags)
    .bind(&now)
    .bind(&now)
    .execute(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn get_saved_queries(
    connection_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SavedQuery>, String> {
    let rows = if let Some(ref conn_id) = connection_id {
        sqlx::query(
            "SELECT id, connection_id, name, sql, description, tags, created_at, updated_at
             FROM saved_queries WHERE connection_id = ? OR connection_id IS NULL
             ORDER BY updated_at DESC",
        )
        .bind(conn_id)
        .fetch_all(&state.config_pool)
        .await
    } else {
        sqlx::query(
            "SELECT id, connection_id, name, sql, description, tags, created_at, updated_at
             FROM saved_queries ORDER BY updated_at DESC",
        )
        .fetch_all(&state.config_pool)
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SavedQuery {
            id: r.try_get("id").unwrap_or_default(),
            connection_id: r.try_get("connection_id").unwrap_or(None),
            name: r.try_get("name").unwrap_or_default(),
            sql: r.try_get("sql").unwrap_or_default(),
            description: r.try_get("description").unwrap_or(None),
            tags: r.try_get("tags").unwrap_or(None),
            created_at: r.try_get("created_at").unwrap_or_default(),
            updated_at: r.try_get("updated_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn delete_saved_query(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM saved_queries WHERE id = ?")
        .bind(&id)
        .execute(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
