use crate::db::execute_query;
use crate::db::types::{ColumnInfo, QueryResult};
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub column: String,
    pub desc: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnFilter {
    pub column: String,
    pub value: String,
}

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
    sort: Option<Vec<SortSpec>>,
    quick_filter: Option<String>,
    column_filters: Option<Vec<ColumnFilter>>,
    state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
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
    let is_pg = matches!(db_type.as_str(), "postgres" | "cockroachdb" | "redshift");

    let sorts = sort.unwrap_or_default();
    let quick = quick_filter.unwrap_or_default();
    let col_filters: Vec<ColumnFilter> = column_filters
        .unwrap_or_default()
        .into_iter()
        .filter(|cf| !cf.value.trim().is_empty())
        .collect();
    let want_quick = !quick.trim().is_empty();

    // Discover columns (needed for quick filter across all columns + safe SELECT for pg).
    let (select_sql, real_types, all_cols) =
        build_table_select(&pool, &db_type, &schema, &table).await;

    // Build WHERE clause + binds
    let mut binds: Vec<String> = Vec::new();
    let mut where_parts: Vec<String> = Vec::new();

    for cf in &col_filters {
        let qcol = quote_ident(&db_type, &cf.column);
        let casted = cast_text(&db_type, &qcol);
        let ph = placeholder(is_pg, binds.len());
        where_parts.push(if is_pg {
            format!("{} ILIKE {}", casted, ph)
        } else {
            format!("LOWER({}) LIKE LOWER({})", casted, ph)
        });
        binds.push(format!("%{}%", cf.value));
    }

    if want_quick && !all_cols.is_empty() {
        let pattern = format!("%{}%", quick);
        let per_col: Vec<String> = all_cols
            .iter()
            .map(|col| {
                let qcol = quote_ident(&db_type, col);
                let casted = cast_text(&db_type, &qcol);
                let ph = placeholder(is_pg, binds.len());
                binds.push(pattern.clone());
                if is_pg {
                    format!("{} ILIKE {}", casted, ph)
                } else {
                    format!("LOWER({}) LIKE LOWER({})", casted, ph)
                }
            })
            .collect();
        where_parts.push(format!("({})", per_col.join(" OR ")));
    }

    let where_sql = if where_parts.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_parts.join(" AND "))
    };

    // Build ORDER BY
    let order_sql = if sorts.is_empty() {
        String::new()
    } else {
        let parts: Vec<String> = sorts
            .iter()
            .map(|s| {
                let qcol = quote_ident(&db_type, &s.column);
                format!("{} {}", qcol, if s.desc { "DESC" } else { "ASC" })
            })
            .collect();
        format!(" ORDER BY {}", parts.join(", "))
    };

    let offset = page * page_size;
    let sql = format!(
        "{}{}{} LIMIT {} OFFSET {}",
        select_sql, where_sql, order_sql, page_size, offset
    );

    let mut result = execute_query_with_binds(&pool, &sql, &binds).await;

    // For postgres, restore real type names (sqlx reports casted columns as "TEXT").
    if is_pg && !real_types.is_empty() {
        for col in &mut result.columns {
            if let Some(real) = real_types.get(&col.name) {
                col.type_name = real.clone();
            }
        }
    }
    Ok(result)
}

fn quote_ident(db_type: &str, name: &str) -> String {
    match db_type {
        "mysql" => format!("`{}`", name.replace('`', "``")),
        _ => format!("\"{}\"", name.replace('"', "\"\"")),
    }
}

fn cast_text(db_type: &str, expr: &str) -> String {
    match db_type {
        "postgres" | "cockroachdb" | "redshift" => format!("{}::text", expr),
        "mysql" => format!("CAST({} AS CHAR)", expr),
        _ => format!("CAST({} AS TEXT)", expr),
    }
}

fn placeholder(is_pg: bool, idx: usize) -> String {
    if is_pg { format!("${}", idx + 1) } else { "?".to_string() }
}

async fn execute_query_with_binds(
    pool: &sqlx::AnyPool,
    sql: &str,
    binds: &[String],
) -> QueryResult {
    use sqlx::{Column, Row, TypeInfo};
    let start = Instant::now();
    let mut q = sqlx::query(sql);
    for v in binds {
        q = q.bind(v.as_str());
    }
    match q.fetch_all(pool).await {
        Ok(rows) => {
            let elapsed = start.elapsed().as_millis() as u64;
            if rows.is_empty() {
                return QueryResult {
                    columns: vec![],
                    rows: vec![],
                    rows_affected: 0,
                    execution_time_ms: elapsed,
                    error: None,
                };
            }
            let columns: Vec<ColumnInfo> = rows[0]
                .columns()
                .iter()
                .map(|c| ColumnInfo {
                    name: c.name().to_string(),
                    type_name: c.type_info().name().to_string(),
                    nullable: true,
                    is_primary_key: false,
                })
                .collect();
            let col_count = columns.len();
            let data: Vec<Vec<serde_json::Value>> = rows
                .iter()
                .map(|r| {
                    (0..col_count)
                        .map(|i| {
                            if let Ok(v) = r.try_get::<Option<bool>, _>(i) {
                                return v.map_or(serde_json::Value::Null, serde_json::Value::Bool);
                            }
                            if let Ok(v) = r.try_get::<Option<i64>, _>(i) {
                                return v.map_or(serde_json::Value::Null, |n| serde_json::json!(n));
                            }
                            if let Ok(v) = r.try_get::<Option<f64>, _>(i) {
                                return v.map_or(serde_json::Value::Null, |f| serde_json::json!(f));
                            }
                            if let Ok(v) = r.try_get::<Option<String>, _>(i) {
                                return v.map_or(serde_json::Value::Null, serde_json::Value::String);
                            }
                            serde_json::Value::Null
                        })
                        .collect()
                })
                .collect();
            QueryResult {
                columns,
                rows: data,
                rows_affected: rows.len() as u64,
                execution_time_ms: elapsed,
                error: None,
            }
        }
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as u64;
            QueryResult {
                columns: vec![],
                rows: vec![],
                rows_affected: 0,
                execution_time_ms: elapsed,
                error: Some(e.to_string()),
            }
        }
    }
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

/// Builds the base SELECT and discovers column names for a table.
/// For Postgres, columns the sqlx Any driver cannot decode (uuid, jsonb, arrays, etc.)
/// are cast to text; `real_types` maps each column to its true type so the caller can
/// restore accurate type labels after execution. `all_cols` is every column name in
/// ordinal order — used by the quick-filter to search across every column.
async fn build_table_select(
    pool: &sqlx::AnyPool,
    db_type: &str,
    schema: &str,
    table: &str,
) -> (String, std::collections::HashMap<String, String>, Vec<String>) {
    use sqlx::Row;
    let empty: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    match db_type {
        "postgres" | "cockroachdb" | "redshift" => {
            let fallback = (
                format!("SELECT * FROM \"{}\".\"{}\"", schema, table),
                empty.clone(),
                Vec::new(),
            );
            let Ok(rows) = sqlx::query(
                "SELECT column_name::text, data_type::text, udt_name::text \
                 FROM information_schema.columns \
                 WHERE table_schema = $1 AND table_name = $2 \
                 ORDER BY ordinal_position",
            )
            .bind(schema)
            .bind(table)
            .fetch_all(pool)
            .await
            else {
                return fallback;
            };
            if rows.is_empty() {
                return fallback;
            }
            let mut real_types = std::collections::HashMap::new();
            let mut all_cols: Vec<String> = Vec::new();
            let cols: Vec<String> = rows
                .iter()
                .map(|r| {
                    let name: String = r.try_get(0).unwrap_or_default();
                    let data_type: String = r.try_get(1).unwrap_or_default();
                    let udt_name: String = r.try_get(2).unwrap_or_default();
                    let display_type = if udt_name.starts_with('_') {
                        format!("{}[]", &udt_name[1..])
                    } else {
                        udt_name.clone()
                    };
                    real_types.insert(name.clone(), display_type);
                    all_cols.push(name.clone());

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
                all_cols,
            )
        }
        "mysql" => {
            let select = format!("SELECT * FROM `{}`.`{}`", schema, table);
            let all_cols: Vec<String> = sqlx::query(
                "SELECT column_name FROM information_schema.columns \
                 WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
            )
            .bind(schema)
            .bind(table)
            .fetch_all(pool)
            .await
            .ok()
            .map(|rows| rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
            .unwrap_or_default();
            (select, empty, all_cols)
        }
        _ => {
            // sqlite
            let select = format!("SELECT * FROM \"{}\"", table.replace('"', "\"\""));
            let pragma = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
            let all_cols: Vec<String> = sqlx::query(&pragma)
                .fetch_all(pool)
                .await
                .ok()
                .map(|rows| {
                    rows.iter()
                        .filter_map(|r| r.try_get::<String, _>("name").ok())
                        .collect()
                })
                .unwrap_or_default();
            (select, empty, all_cols)
        }
    }
}
