use crate::AppState;
use chrono::Utc;
use sqlx::Row;

#[tauri::command]
pub async fn export_workspace(
    path: String,
    include_connections: bool,
    include_queries: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = &state.config_pool;

    let connections: Vec<serde_json::Value> = if include_connections {
        let rows = sqlx::query(
            "SELECT id, name, db_type, host, port, database, username, ssl_mode, color_tag, group_name \
             FROM connections ORDER BY name",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.try_get::<String, _>("id").unwrap_or_default(),
                    "name": r.try_get::<String, _>("name").unwrap_or_default(),
                    "db_type": r.try_get::<String, _>("db_type").unwrap_or_default(),
                    "host": r.try_get::<Option<String>, _>("host").unwrap_or(None),
                    "port": r.try_get::<Option<i64>, _>("port").unwrap_or(None),
                    "database": r.try_get::<Option<String>, _>("database").unwrap_or(None),
                    "username": r.try_get::<Option<String>, _>("username").unwrap_or(None),
                    "ssl_mode": r.try_get::<Option<String>, _>("ssl_mode").unwrap_or(None),
                    "color_tag": r.try_get::<Option<String>, _>("color_tag").unwrap_or(None),
                    "group_name": r.try_get::<Option<String>, _>("group_name").unwrap_or(None),
                })
            })
            .collect()
    } else {
        vec![]
    };

    let saved_queries: Vec<serde_json::Value> = if include_queries {
        let rows = sqlx::query(
            "SELECT id, connection_id, name, sql, description, tags, created_at, updated_at \
             FROM saved_queries ORDER BY name",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.try_get::<String, _>("id").unwrap_or_default(),
                    "connection_id": r.try_get::<Option<String>, _>("connection_id").unwrap_or(None),
                    "name": r.try_get::<String, _>("name").unwrap_or_default(),
                    "sql": r.try_get::<String, _>("sql").unwrap_or_default(),
                    "description": r.try_get::<Option<String>, _>("description").unwrap_or(None),
                    "tags": r.try_get::<Option<String>, _>("tags").unwrap_or(None),
                    "created_at": r.try_get::<String, _>("created_at").unwrap_or_default(),
                    "updated_at": r.try_get::<String, _>("updated_at").unwrap_or_default(),
                })
            })
            .collect()
    } else {
        vec![]
    };

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": Utc::now().to_rfc3339(),
        "connections": connections,
        "saved_queries": saved_queries,
    });

    let json_str = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    std::fs::write(&path, json_str).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn import_workspace(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = &state.config_pool;

    let json_str = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    let mut connections_imported: u64 = 0;
    let mut queries_imported: u64 = 0;

    if let Some(connections) = data["connections"].as_array() {
        for conn in connections {
            let result = sqlx::query(
                "INSERT OR IGNORE INTO connections \
                 (id, name, db_type, host, port, database, username, ssl_mode, color_tag, group_name, read_only, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))",
            )
            .bind(conn["id"].as_str().unwrap_or_default())
            .bind(conn["name"].as_str().unwrap_or_default())
            .bind(conn["db_type"].as_str().unwrap_or_default())
            .bind(conn["host"].as_str())
            .bind(conn["port"].as_i64())
            .bind(conn["database"].as_str())
            .bind(conn["username"].as_str())
            .bind(conn["ssl_mode"].as_str())
            .bind(conn["color_tag"].as_str())
            .bind(conn["group_name"].as_str())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            connections_imported += result.rows_affected();
        }
    }

    if let Some(queries) = data["saved_queries"].as_array() {
        for q in queries {
            let result = sqlx::query(
                "INSERT OR IGNORE INTO saved_queries \
                 (id, connection_id, name, sql, description, tags, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(q["id"].as_str().unwrap_or_default())
            .bind(q["connection_id"].as_str())
            .bind(q["name"].as_str().unwrap_or_default())
            .bind(q["sql"].as_str().unwrap_or_default())
            .bind(q["description"].as_str())
            .bind(q["tags"].as_str())
            .bind(q["created_at"].as_str().unwrap_or_default())
            .bind(q["updated_at"].as_str().unwrap_or_default())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

            queries_imported += result.rows_affected();
        }
    }

    Ok(serde_json::json!({
        "connections_imported": connections_imported,
        "queries_imported": queries_imported,
    }))
}
