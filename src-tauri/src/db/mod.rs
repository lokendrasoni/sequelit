pub mod types;

use anyhow::Result;
use sqlx::any::{AnyPoolOptions, AnyRow};
use sqlx::{AnyPool, Column, Row, TypeInfo};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use types::*;

pub type PoolMap = Mutex<HashMap<String, AnyPool>>;

pub fn new_pool_map() -> PoolMap {
    Mutex::new(HashMap::new())
}

pub async fn open_pool(url: &str) -> Result<AnyPool> {
    sqlx::any::install_default_drivers();
    let pool = AnyPoolOptions::new()
        .max_connections(5)
        .connect(url)
        .await?;
    Ok(pool)
}

pub async fn execute_query(pool: &AnyPool, sql: &str) -> QueryResult {
    let start = Instant::now();
    match sqlx::query(sql).fetch_all(pool).await {
        Ok(rows) => {
            let elapsed = start.elapsed().as_millis() as u64;
            if rows.is_empty() {
                // Could be INSERT/UPDATE/DELETE — try execute
                let columns = vec![];
                return QueryResult {
                    columns,
                    rows: vec![],
                    rows_affected: 0,
                    execution_time_ms: elapsed,
                    error: None,
                };
            }
            let columns = extract_columns(&rows[0]);
            let data = rows.iter().map(|r| extract_row_values(r, r.len())).collect();
            QueryResult {
                columns,
                rows: data,
                rows_affected: rows.len() as u64,
                execution_time_ms: elapsed,
                error: None,
            }
        }
        Err(e) => {
            // Try as a non-SELECT statement
            let elapsed = start.elapsed().as_millis() as u64;
            match sqlx::query(sql).execute(pool).await {
                Ok(res) => QueryResult {
                    columns: vec![],
                    rows: vec![],
                    rows_affected: res.rows_affected(),
                    execution_time_ms: elapsed,
                    error: None,
                },
                Err(_) => QueryResult {
                    columns: vec![],
                    rows: vec![],
                    rows_affected: 0,
                    execution_time_ms: elapsed,
                    error: Some(e.to_string()),
                },
            }
        }
    }
}

fn extract_columns(row: &AnyRow) -> Vec<ColumnInfo> {
    row.columns()
        .iter()
        .map(|c| ColumnInfo {
            name: c.name().to_string(),
            type_name: c.type_info().name().to_string(),
            nullable: true,
            is_primary_key: false,
        })
        .collect()
}

fn extract_row_values(row: &AnyRow, col_count: usize) -> Vec<serde_json::Value> {
    (0..col_count)
        .map(|i| {
            if let Ok(v) = row.try_get::<Option<bool>, _>(i) {
                return match v {
                    Some(b) => serde_json::Value::Bool(b),
                    None => serde_json::Value::Null,
                };
            }
            if let Ok(v) = row.try_get::<Option<i64>, _>(i) {
                return match v {
                    Some(n) => serde_json::json!(n),
                    None => serde_json::Value::Null,
                };
            }
            if let Ok(v) = row.try_get::<Option<f64>, _>(i) {
                return match v {
                    Some(f) => serde_json::json!(f),
                    None => serde_json::Value::Null,
                };
            }
            if let Ok(v) = row.try_get::<Option<String>, _>(i) {
                return match v {
                    Some(s) => serde_json::Value::String(s),
                    None => serde_json::Value::Null,
                };
            }
            serde_json::Value::Null
        })
        .collect()
}

pub async fn list_schemas(pool: &AnyPool, db_type: &str, show_system: bool) -> Result<Vec<String>> {
    let sql = match db_type {
        "postgres" | "cockroachdb" | "redshift" => {
            if show_system {
                // Show everything except the absolute internals.
                "SELECT schema_name::text FROM information_schema.schemata \
                 WHERE schema_name::text NOT IN ('pg_catalog','information_schema') \
                 ORDER BY schema_name"
            } else {
                // Hide pg_toast, pg_toast_temp_*, pg_temp_* — never user schemas.
                "SELECT schema_name::text FROM information_schema.schemata \
                 WHERE schema_name::text NOT IN ('pg_catalog','information_schema','pg_toast') \
                   AND schema_name::text NOT LIKE 'pg_toast_temp_%' \
                   AND schema_name::text NOT LIKE 'pg_temp_%' \
                 ORDER BY schema_name"
            }
        }
        "mysql" => "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
        _ => return Ok(vec!["main".to_string()]),
    };
    let rows = sqlx::query(sql).fetch_all(pool).await?;
    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

pub async fn list_tables(pool: &AnyPool, db_type: &str, schema: &str) -> Result<Vec<TableInfo>> {
    let rows = match db_type {
        "postgres" | "cockroachdb" | "redshift" => {
            sqlx::query(
                "SELECT table_schema::text, table_name::text, table_type::text \
                 FROM information_schema.tables \
                 WHERE table_schema = $1 ORDER BY table_type, table_name",
            )
            .bind(schema)
            .fetch_all(pool)
            .await?
        }
        "mysql" => {
            sqlx::query(
                "SELECT table_schema, table_name, table_type FROM information_schema.tables \
                 WHERE table_schema = ? ORDER BY table_type, table_name",
            )
            .bind(schema)
            .fetch_all(pool)
            .await?
        }
        _ => {
            sqlx::query(
                "SELECT 'main', name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
            )
            .fetch_all(pool)
            .await?
        }
    };

    Ok(rows
        .iter()
        .map(|r| TableInfo {
            schema: r.try_get::<String, _>(0).unwrap_or_default(),
            name: r.try_get::<String, _>(1).unwrap_or_default(),
            table_type: r.try_get::<String, _>(2).unwrap_or_default(),
            row_count: None,
        })
        .collect())
}

pub async fn describe_table(
    pool: &AnyPool,
    db_type: &str,
    schema: &str,
    table: &str,
) -> Result<TableDetail> {
    let columns = match db_type {
        "postgres" | "cockroachdb" | "redshift" => {
            let rows = sqlx::query(
                "SELECT c.column_name::text, c.data_type::text, c.is_nullable::text,
                        c.column_default::text, c.ordinal_position::int,
                 CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
                 FROM information_schema.columns c
                 LEFT JOIN (
                   SELECT ku.column_name::text FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage ku
                     ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
                   WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
                 ) pk ON c.column_name::text = pk.column_name
                 WHERE c.table_schema = $1 AND c.table_name = $2
                 ORDER BY c.ordinal_position"
            )
            .bind(schema)
            .bind(table)
            .fetch_all(pool)
            .await?;
            rows.iter().map(|r| ColumnDetail {
                name: r.try_get::<String, _>(0).unwrap_or_default(),
                data_type: r.try_get::<String, _>(1).unwrap_or_default(),
                is_nullable: r.try_get::<String, _>(2).map(|s| s == "YES").unwrap_or(true),
                column_default: r.try_get::<Option<String>, _>(3).unwrap_or(None),
                ordinal_position: r.try_get::<i32, _>(4).unwrap_or(0),
                is_primary_key: r.try_get::<bool, _>(5).unwrap_or(false),
                is_unique: false,
            }).collect()
        }
        "mysql" => {
            let rows = sqlx::query(
                "SELECT column_name, column_type, is_nullable, column_default, ordinal_position,
                 IF(column_key='PRI', true, false) as is_pk
                 FROM information_schema.columns
                 WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
            )
            .bind(schema)
            .bind(table)
            .fetch_all(pool)
            .await?;
            rows.iter().map(|r| ColumnDetail {
                name: r.try_get::<String, _>(0).unwrap_or_default(),
                data_type: r.try_get::<String, _>(1).unwrap_or_default(),
                is_nullable: r.try_get::<String, _>(2).map(|s| s == "YES").unwrap_or(true),
                column_default: r.try_get::<Option<String>, _>(3).unwrap_or(None),
                ordinal_position: r.try_get::<i32, _>(4).unwrap_or(0),
                is_primary_key: r.try_get::<bool, _>(5).unwrap_or(false),
                is_unique: false,
            }).collect()
        }
        _ => {
            let rows = sqlx::query(&format!("PRAGMA table_info(\"{}\")", table))
                .fetch_all(pool)
                .await?;
            rows.iter().map(|r| ColumnDetail {
                ordinal_position: r.try_get::<i32, _>(0).unwrap_or(0),
                name: r.try_get::<String, _>(1).unwrap_or_default(),
                data_type: r.try_get::<String, _>(2).unwrap_or_default(),
                is_nullable: r.try_get::<i32, _>(3).map(|v| v == 0).unwrap_or(true),
                column_default: r.try_get::<Option<String>, _>(4).unwrap_or(None),
                is_primary_key: r.try_get::<i32, _>(5).map(|v| v == 1).unwrap_or(false),
                is_unique: false,
            }).collect()
        }
    };

    Ok(TableDetail {
        schema: schema.to_string(),
        name: table.to_string(),
        columns,
        indexes: vec![],
        ddl: None,
    })
}
