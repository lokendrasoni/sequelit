use crate::db::execute_query;
use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::path::Path;

// ── EXPLAIN ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn explain_query(
    connection_id: String,
    sql: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (pool, db_type) = {
        let pool = {
            let pools = state.db_pools.lock().unwrap();
            pools.get(&connection_id).ok_or("Not connected")?.clone()
        };
        let db_type = sqlx::query("SELECT db_type FROM connections WHERE id = ?")
            .bind(&connection_id)
            .fetch_one(&state.config_pool)
            .await
            .map_err(|e| e.to_string())
            .map(|r| r.try_get::<String, _>("db_type").unwrap_or_default())
            .unwrap_or_default();
        (pool, db_type)
    };

    match db_type.as_str() {
        "postgres" => {
            let explain_sql = format!("EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) {}", sql);
            let result = execute_query(&pool, &explain_sql).await;
            if let Some(err) = result.error {
                return Err(err);
            }
            if let Some(row) = result.rows.first() {
                if let Some(val) = row.first() {
                    let plan_str = val.as_str().unwrap_or("[]");
                    let parsed: serde_json::Value =
                        serde_json::from_str(plan_str).unwrap_or(serde_json::json!([]));
                    return Ok(parsed);
                }
            }
            Ok(serde_json::json!([]))
        }
        "mysql" => {
            let explain_sql = format!("EXPLAIN FORMAT=JSON {}", sql);
            let result = execute_query(&pool, &explain_sql).await;
            if let Some(err) = result.error {
                return Err(err);
            }
            if let Some(row) = result.rows.first() {
                if let Some(val) = row.first() {
                    let plan_str = val.as_str().unwrap_or("{}");
                    let parsed: serde_json::Value =
                        serde_json::from_str(plan_str).unwrap_or(serde_json::json!({}));
                    return Ok(parsed);
                }
            }
            Ok(serde_json::json!({}))
        }
        _ => Err("EXPLAIN visualization only supported for PostgreSQL and MySQL".to_string()),
    }
}

// ── SCHEMA DIFF ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffEntry {
    pub kind: String, // "added", "removed", "modified"
    pub object_type: String,
    pub name: String,
    pub detail: Option<String>,
    pub sql: Option<String>,
}

#[tauri::command]
pub async fn diff_schemas(
    conn1_id: String,
    schema1: String,
    conn2_id: String,
    schema2: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiffEntry>, String> {
    let pool1 = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&conn1_id).ok_or("Connection 1 not connected")?.clone()
    };
    let pool2 = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&conn2_id).ok_or("Connection 2 not connected")?.clone()
    };

    let tables1 = fetch_table_names(&pool1, &schema1).await?;
    let tables2 = fetch_table_names(&pool2, &schema2).await?;

    let mut diffs = Vec::new();

    for t in &tables1 {
        if !tables2.contains(t) {
            diffs.push(DiffEntry {
                kind: "removed".to_string(),
                object_type: "table".to_string(),
                name: t.clone(),
                detail: Some(format!("Table {} exists in {} but not in {}", t, schema1, schema2)),
                sql: Some(format!("-- DROP TABLE \"{}\".\"{}\"", schema1, t)),
            });
        }
    }
    for t in &tables2 {
        if !tables1.contains(t) {
            diffs.push(DiffEntry {
                kind: "added".to_string(),
                object_type: "table".to_string(),
                name: t.clone(),
                detail: Some(format!("Table {} exists in {} but not in {}", t, schema2, schema1)),
                sql: Some(format!("-- Table \"{}\" needs to be created in {}", t, schema1)),
            });
        }
    }

    // For matching tables, compare column counts
    for t in tables1.iter().filter(|t| tables2.contains(t)) {
        let cols1 = fetch_column_names(&pool1, &schema1, t).await?;
        let cols2 = fetch_column_names(&pool2, &schema2, t).await?;

        for col in &cols1 {
            if !cols2.contains(col) {
                diffs.push(DiffEntry {
                    kind: "removed".to_string(),
                    object_type: "column".to_string(),
                    name: format!("{}.{}", t, col),
                    detail: Some(format!("Column {} removed from {}", col, t)),
                    sql: Some(format!("ALTER TABLE \"{}\".\"{}\" DROP COLUMN \"{}\"", schema1, t, col)),
                });
            }
        }
        for col in &cols2 {
            if !cols1.contains(col) {
                diffs.push(DiffEntry {
                    kind: "added".to_string(),
                    object_type: "column".to_string(),
                    name: format!("{}.{}", t, col),
                    detail: Some(format!("Column {} added to {}", col, t)),
                    sql: Some(format!("ALTER TABLE \"{}\".\"{}\" ADD COLUMN \"{}\" TEXT", schema1, t, col)),
                });
            }
        }
    }

    Ok(diffs)
}

async fn fetch_table_names(pool: &sqlx::AnyPool, schema: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        "SELECT table_name FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
}

async fn fetch_column_names(
    pool: &sqlx::AnyPool,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        "SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
}

// ── ERD relationships ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct FkRelationship {
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
    pub constraint_name: String,
}

#[tauri::command]
pub async fn get_fk_relationships(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FkRelationship>, String> {
    let (pool, db_type) = {
        let pool = {
            let pools = state.db_pools.lock().unwrap();
            pools.get(&connection_id).ok_or("Not connected")?.clone()
        };
        let db_type = sqlx::query("SELECT db_type FROM connections WHERE id = ?")
            .bind(&connection_id)
            .fetch_one(&state.config_pool)
            .await
            .map_err(|e| e.to_string())
            .map(|r| r.try_get::<String, _>("db_type").unwrap_or_default())
            .unwrap_or_default();
        (pool, db_type)
    };

    let rows = match db_type.as_str() {
        "postgres" | "cockroachdb" | "redshift" => sqlx::query(
            "SELECT
               kcu.constraint_name::text,
               kcu.table_name::text AS from_table,
               kcu.column_name::text AS from_column,
               ccu.table_name::text AS to_table,
               ccu.column_name::text AS to_column
             FROM information_schema.key_column_usage kcu
             JOIN information_schema.referential_constraints rc
               ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
             JOIN information_schema.constraint_column_usage ccu
               ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.constraint_schema
             WHERE kcu.table_schema = $1",
        )
        .bind(&schema)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,

        "mysql" => sqlx::query(
            "SELECT constraint_name, table_name AS from_table, column_name AS from_column,
                    referenced_table_name AS to_table, referenced_column_name AS to_column
             FROM information_schema.key_column_usage
             WHERE table_schema = ? AND referenced_table_name IS NOT NULL",
        )
        .bind(&schema)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,

        _ => return Ok(vec![]),
    };

    Ok(rows
        .iter()
        .map(|r| FkRelationship {
            constraint_name: r.try_get::<String, _>(0).unwrap_or_default(),
            from_table: r.try_get::<String, _>(1).unwrap_or_default(),
            from_column: r.try_get::<String, _>(2).unwrap_or_default(),
            to_table: r.try_get::<String, _>(3).unwrap_or_default(),
            to_column: r.try_get::<String, _>(4).unwrap_or_default(),
        })
        .collect())
}

// ── IMPORT CSV ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn import_csv(
    connection_id: String,
    schema: String,
    table: String,
    file_path: String,
    has_header: bool,
    delimiter: String,
    state: tauri::State<'_, AppState>,
) -> Result<u64, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let delim = delimiter.chars().next().unwrap_or(',') as u8;

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(has_header)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = if has_header {
        reader
            .headers()
            .map_err(|e| e.to_string())?
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        vec![]
    };

    let placeholders = if headers.is_empty() {
        return Err("Headers required for CSV import".to_string());
    } else {
        headers.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
    };
    let col_list = headers
        .iter()
        .map(|h| format!("\"{}\"", h))
        .collect::<Vec<_>>()
        .join(", ");
    let insert_sql = format!(
        "INSERT INTO \"{}\".\"{}\" ({}) VALUES ({})",
        schema, table, col_list, placeholders
    );

    let mut rows_inserted = 0u64;
    for result in reader.records() {
        let record = result.map_err(|e| e.to_string())?;
        let mut q = sqlx::query(&insert_sql);
        for field in record.iter() {
            q = q.bind(field.to_string());
        }
        q.execute(&pool).await.map_err(|e| e.to_string())?;
        rows_inserted += 1;
    }

    Ok(rows_inserted)
}

// ── EXPORT CSV ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportRequest {
    pub schema: String,
    pub table: String,
}

#[tauri::command]
pub async fn export_tables_csv(
    connection_id: String,
    tables: Vec<ExportRequest>,
    output_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let (pool, db_type) = {
        let pool = {
            let pools = state.db_pools.lock().unwrap();
            pools.get(&connection_id).ok_or("Not connected")?.clone()
        };
        let db_type = sqlx::query("SELECT db_type FROM connections WHERE id = ?")
            .bind(&connection_id)
            .fetch_one(&state.config_pool)
            .await
            .map_err(|e| e.to_string())
            .map(|r| r.try_get::<String, _>("db_type").unwrap_or_default())
            .unwrap_or_default();
        (pool, db_type)
    };

    let dir = Path::new(&output_dir);
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let mut exported = Vec::new();
    for req in &tables {
        let sql = match db_type.as_str() {
            "sqlite" => format!("SELECT * FROM \"{}\"", req.table),
            _ => format!("SELECT * FROM \"{}\".\"{}\"", req.schema, req.table),
        };

        let result = crate::db::execute_query(&pool, &sql).await;
        if result.error.is_some() {
            continue;
        }

        let file_name = format!("{}_{}.csv", req.schema, req.table);
        let file_path = dir.join(&file_name);
        let mut wtr = csv::Writer::from_path(&file_path).map_err(|e| e.to_string())?;

        // Write header
        wtr.write_record(result.columns.iter().map(|c| c.name.as_str()))
            .map_err(|e| e.to_string())?;

        // Write rows
        for row in &result.rows {
            let record: Vec<String> = row
                .iter()
                .map(|v| match v {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .collect();
            wtr.write_record(&record).map_err(|e| e.to_string())?;
        }
        wtr.flush().map_err(|e| e.to_string())?;
        exported.push(file_path.to_string_lossy().to_string());
    }

    Ok(exported)
}

// ── BACKUP / RESTORE ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_pg_dump_cmd(
    connection_id: String,
    output_path: String,
    format: String, // "plain", "custom", "tar", "directory"
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT host, port, database, username FROM connections WHERE id = ?",
    )
    .bind(&connection_id)
    .fetch_one(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    let host: String = row.try_get("host").unwrap_or_else(|_| "localhost".to_string());
    let port: i64 = row.try_get("port").unwrap_or(5432);
    let database: String = row.try_get("database").unwrap_or_default();
    let username: String = row.try_get("username").unwrap_or_default();

    let fmt_flag = match format.as_str() {
        "custom" => "-Fc",
        "tar" => "-Ft",
        "directory" => "-Fd",
        _ => "-Fp",
    };

    Ok(format!(
        "pg_dump -h {} -p {} -U {} {} -f \"{}\" {}",
        host, port, username, fmt_flag, output_path, database
    ))
}

#[tauri::command]
pub async fn get_pg_restore_cmd(
    connection_id: String,
    file_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT host, port, database, username FROM connections WHERE id = ?",
    )
    .bind(&connection_id)
    .fetch_one(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    let host: String = row.try_get("host").unwrap_or_else(|_| "localhost".to_string());
    let port: i64 = row.try_get("port").unwrap_or(5432);
    let database: String = row.try_get("database").unwrap_or_default();
    let username: String = row.try_get("username").unwrap_or_default();

    Ok(format!(
        "pg_restore -h {} -p {} -U {} -d {} --clean --if-exists \"{}\"",
        host, port, username, database, file_path
    ))
}
