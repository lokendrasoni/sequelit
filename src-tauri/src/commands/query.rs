use crate::db::execute_query;
use crate::db::types::QueryResult;
use crate::AppState;
use chrono::Utc;
use uuid::Uuid;

#[tauri::command]
pub async fn run_query(
    connection_id: String,
    sql: String,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    // Touch session
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(s) = sessions.get_mut(&connection_id) {
            if s.is_expired() {
                return Err("SESSION_EXPIRED".to_string());
            }
            s.touch();
        }
    }

    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools
            .get(&connection_id)
            .ok_or("Not connected")?
            .clone()
    };

    let result = execute_query(&pool, &sql).await;

    // Save to history
    let history_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let error_clone = result.error.clone();
    let duration = result.execution_time_ms as i64;
    let sql_clone = sql.clone();
    let conn_id_clone = connection_id.clone();
    let config_pool = state.config_pool.clone();
    tokio::spawn(async move {
        let _ = sqlx::query(
            "INSERT INTO query_history (id, connection_id, sql, executed_at, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&history_id)
        .bind(&conn_id_clone)
        .bind(&sql_clone)
        .bind(&now)
        .bind(duration)
        .bind(error_clone)
        .execute(&config_pool)
        .await;
    });

    Ok(result)
}

#[tauri::command]
pub async fn get_query_history(
    connection_id: String,
    limit: Option<i64>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(100);
    let rows = sqlx::query(
        "SELECT id, sql, executed_at, duration_ms, error FROM query_history
         WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ?",
    )
    .bind(&connection_id)
    .bind(limit)
    .fetch_all(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    use sqlx::Row;
    Ok(rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.try_get::<String, _>("id").unwrap_or_default(),
                "sql": r.try_get::<String, _>("sql").unwrap_or_default(),
                "executed_at": r.try_get::<String, _>("executed_at").unwrap_or_default(),
                "duration_ms": r.try_get::<Option<i64>, _>("duration_ms").unwrap_or(None),
                "error": r.try_get::<Option<String>, _>("error").unwrap_or(None),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_table_rows(
    connection_id: String,
    schema: String,
    table: String,
    page: i64,
    page_size: i64,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    // Acquire pool synchronously — guard must be dropped before any await
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    // Now safe to await: no MutexGuard live
    let db_type = {
        use sqlx::Row;
        sqlx::query("SELECT db_type FROM connections WHERE id = ?")
            .bind(&connection_id)
            .fetch_one(&state.config_pool)
            .await
            .map_err(|e| e.to_string())
            .map(|r| r.try_get::<String, _>("db_type").unwrap_or_default())
            .unwrap_or_default()
    };

    let offset = page * page_size;
    let sql = match db_type.as_str() {
        "sqlite" => format!("SELECT * FROM \"{}\" LIMIT {} OFFSET {}", table, page_size, offset),
        "mysql" => format!("SELECT * FROM `{}`.`{}` LIMIT {} OFFSET {}", schema, table, page_size, offset),
        _ => {
            // Build a SELECT that casts Any-driver-incompatible Postgres types to text,
            // and capture the real column types so we can restore them in the result.
            let (select, real_types) = build_pg_safe_select(&pool, &schema, &table).await;
            let sql = format!("{} LIMIT {} OFFSET {}", select, page_size, offset);
            let mut result = execute_query(&pool, &sql).await;
            // sqlx reports casted columns as "TEXT"; restore the real types for display.
            if !real_types.is_empty() {
                for col in &mut result.columns {
                    if let Some(real) = real_types.get(&col.name) {
                        col.type_name = real.clone();
                    }
                }
            }
            return Ok(result);
        }
    };
    Ok(execute_query(&pool, &sql).await)
}

async fn get_conn_db_type(connection_id: &str, state: &tauri::State<'_, AppState>) -> String {
    use sqlx::Row;
    sqlx::query("SELECT db_type FROM connections WHERE id = ?")
        .bind(connection_id)
        .fetch_one(&state.config_pool)
        .await
        .map(|r| r.try_get::<String, _>("db_type").unwrap_or_default())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn delete_table_row(
    connection_id: String,
    schema: String,
    table: String,
    pk_cols: Vec<String>,
    pk_vals: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<u64, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let db_type = get_conn_db_type(&connection_id, &state).await;

    let where_parts: Vec<String> = pk_cols
        .iter()
        .enumerate()
        .map(|(i, col)| match db_type.as_str() {
            "postgres" | "cockroachdb" | "redshift" => {
                format!("\"{}\"::text = ${}", col.replace('"', "\"\""), i + 1)
            }
            "mysql" => format!("`{}` = ?", col.replace('`', "``")),
            _ => format!("\"{}\" = ?", col.replace('"', "\"\"")),
        })
        .collect();

    let sql = match db_type.as_str() {
        "mysql" => format!(
            "DELETE FROM `{}`.`{}` WHERE {}",
            schema.replace('`', "``"),
            table.replace('`', "``"),
            where_parts.join(" AND ")
        ),
        "sqlite" => format!(
            "DELETE FROM \"{}\" WHERE {}",
            table.replace('"', "\"\""),
            where_parts.join(" AND ")
        ),
        _ => format!(
            "DELETE FROM \"{}\".\"{}\" WHERE {}",
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            where_parts.join(" AND ")
        ),
    };

    let mut q = sqlx::query(&sql);
    for v in &pk_vals {
        q = q.bind(v.as_str());
    }
    let res = q.execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(res.rows_affected())
}

#[tauri::command]
pub async fn update_table_cell(
    connection_id: String,
    schema: String,
    table: String,
    pk_cols: Vec<String>,
    pk_vals: Vec<String>,
    col: String,
    val: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let db_type = get_conn_db_type(&connection_id, &state).await;

    let (set_clause, where_parts): (String, Vec<String>) = match db_type.as_str() {
        "postgres" | "cockroachdb" | "redshift" => {
            let set = format!("\"{}\" = $1", col.replace('"', "\"\""));
            let wh = pk_cols
                .iter()
                .enumerate()
                .map(|(i, c)| format!("\"{}\"::text = ${}", c.replace('"', "\"\""), i + 2))
                .collect();
            (set, wh)
        }
        "mysql" => {
            let set = format!("`{}` = ?", col.replace('`', "``"));
            let wh = pk_cols
                .iter()
                .map(|c| format!("`{}` = ?", c.replace('`', "``")))
                .collect();
            (set, wh)
        }
        _ => {
            let set = format!("\"{}\" = ?", col.replace('"', "\"\""));
            let wh = pk_cols
                .iter()
                .map(|c| format!("\"{}\" = ?", c.replace('"', "\"\"")))
                .collect();
            (set, wh)
        }
    };

    let sql = match db_type.as_str() {
        "mysql" => format!(
            "UPDATE `{}`.`{}` SET {} WHERE {}",
            schema.replace('`', "``"),
            table.replace('`', "``"),
            set_clause,
            where_parts.join(" AND ")
        ),
        "sqlite" => format!(
            "UPDATE \"{}\" SET {} WHERE {}",
            table.replace('"', "\"\""),
            set_clause,
            where_parts.join(" AND ")
        ),
        _ => format!(
            "UPDATE \"{}\".\"{}\" SET {} WHERE {}",
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            set_clause,
            where_parts.join(" AND ")
        ),
    };

    let mut q = sqlx::query(&sql);
    q = q.bind(val.as_deref());
    for v in &pk_vals {
        q = q.bind(v.as_str());
    }
    q.execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Builds a SELECT list for a Postgres table where columns with types the sqlx Any
/// driver cannot decode (uuid, json, jsonb, inet, arrays, enums, etc.) are cast to text.
/// Returns `(sql, real_types)` where `real_types` maps column name → PostgreSQL type name
/// so callers can restore accurate type labels in the result after execution.
async fn build_pg_safe_select(
    pool: &sqlx::AnyPool,
    schema: &str,
    table: &str,
) -> (String, std::collections::HashMap<String, String>) {
    use sqlx::Row;

    let fallback = format!("SELECT * FROM \"{}\".\"{}\"", schema, table);
    let empty: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    let Ok(rows) = sqlx::query(
        "SELECT column_name::text, data_type::text, udt_name::text \
         FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = $2 \
         ORDER BY ordinal_position",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await else {
        return (fallback, empty);
    };

    if rows.is_empty() {
        return (fallback, empty);
    }

    let mut real_types = std::collections::HashMap::new();
    let cols: Vec<String> = rows
        .iter()
        .map(|r| {
            let name: String = r.try_get(0).unwrap_or_default();
            let data_type: String = r.try_get(1).unwrap_or_default();
            let udt_name: String = r.try_get(2).unwrap_or_default();

            // Use udt_name as display type: it gives concise PG-native names
            // (timestamptz, uuid, jsonb, _int4, etc.) rather than SQL-standard verbose names.
            let display_type = if udt_name.starts_with('_') {
                format!("{}[]", &udt_name[1..]) // _int4 → int4[]
            } else {
                udt_name.clone()
            };
            real_types.insert(name.clone(), display_type);

            // Types the Any driver cannot map to a Rust type without an explicit cast.
            let needs_cast = matches!(
                data_type.as_str(),
                "uuid"
                    | "json" | "jsonb"
                    | "inet" | "cidr"
                    | "interval"
                    | "tsvector" | "tsquery"
                    | "xml"
                    | "bit" | "bit varying"
                    | "point" | "line" | "lseg" | "box" | "path" | "polygon" | "circle"
                    | "macaddr" | "macaddr8"
                    | "money"
                    | "timestamp with time zone"
                    | "timestamp without time zone"
                    | "time with time zone"
                    | "time without time zone"
                    | "date"
                    | "bytea"
                    | "numeric"
                    | "USER-DEFINED" | "ARRAY"
            ) || udt_name.starts_with('_');

            let quoted = format!("\"{}\"", name.replace('"', "\"\""));
            if needs_cast {
                format!("{}::text AS {}", quoted, quoted)
            } else {
                quoted
            }
        })
        .collect();

    (
        format!(
            "SELECT {} FROM \"{}\".\"{}\"",
            cols.join(", "),
            schema,
            table
        ),
        real_types,
    )
}
