use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub columns: String,
    pub definition: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConstraintInfo {
    pub name: String,
    pub constraint_type: String, // p=primary, u=unique, f=foreign, c=check
    pub columns: String,
    pub definition: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaType {
    pub name: String,
    pub category: String, // enum, domain, composite, range
    pub details: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaFunction {
    pub name: String,
    pub kind: String, // function, procedure, aggregate, window
    pub arguments: String,
    pub return_type: String,
    pub language: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaSequence {
    pub name: String,
    pub start_value: i64,
    pub increment: i64,
    pub min_value: i64,
    pub max_value: i64,
    pub is_cycle: bool,
}

fn pool_for(connection_id: &str, state: &tauri::State<'_, AppState>) -> Result<sqlx::AnyPool, String> {
    state.db_pools.lock().unwrap().get(connection_id).ok_or("Not connected".to_string()).cloned()
}

// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_table_indexes(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<IndexInfo>, String> {
    let pool = pool_for(&connection_id, &state)?;

    let rows = sqlx::query(
        "SELECT i.relname::text AS name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary,
                string_agg(a.attname::text, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
                pg_get_indexdef(ix.indexrelid)::text AS definition
         FROM pg_index ix
         JOIN pg_class i  ON i.oid  = ix.indexrelid
         JOIN pg_class t  ON t.oid  = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
         WHERE n.nspname = $1 AND t.relname = $2 AND a.attnum > 0
         GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indexrelid
         ORDER BY ix.indisprimary DESC, i.relname",
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| IndexInfo {
            name: r.try_get("name").unwrap_or_default(),
            is_unique: r.try_get("is_unique").unwrap_or(false),
            is_primary: r.try_get("is_primary").unwrap_or(false),
            columns: r.try_get("columns").unwrap_or_default(),
            definition: r.try_get("definition").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn get_table_constraints(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ConstraintInfo>, String> {
    let pool = pool_for(&connection_id, &state)?;

    let rows = sqlx::query(
        "SELECT c.conname::text AS name,
                c.contype::text AS constraint_type,
                COALESCE(
                    string_agg(a.attname::text, ', ' ORDER BY array_position(c.conkey, a.attnum)),
                    ''
                ) AS columns,
                pg_get_constraintdef(c.oid)::text AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) AND a.attnum > 0
         WHERE n.nspname = $1 AND t.relname = $2
         GROUP BY c.conname, c.contype, c.oid
         ORDER BY c.contype, c.conname",
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            let raw_type: String = r.try_get("constraint_type").unwrap_or_default();
            let constraint_type = match raw_type.as_str() {
                "p" => "PRIMARY KEY".to_string(),
                "u" => "UNIQUE".to_string(),
                "f" => "FOREIGN KEY".to_string(),
                "c" => "CHECK".to_string(),
                "t" => "TRIGGER".to_string(),
                "x" => "EXCLUSION".to_string(),
                other => other.to_string(),
            };
            ConstraintInfo {
                name: r.try_get("name").unwrap_or_default(),
                constraint_type,
                columns: r.try_get("columns").unwrap_or_default(),
                definition: r.try_get("definition").unwrap_or_default(),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_schema_types(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SchemaType>, String> {
    let pool = pool_for(&connection_id, &state)?;

    let rows = sqlx::query(
        "SELECT t.typname::text AS name,
                CASE t.typtype
                    WHEN 'e' THEN 'enum'
                    WHEN 'd' THEN 'domain'
                    WHEN 'c' THEN 'composite'
                    WHEN 'r' THEN 'range'
                    ELSE t.typtype::text
                END AS category,
                CASE t.typtype
                    WHEN 'e' THEN (
                        SELECT string_agg(e.enumlabel::text, ', ' ORDER BY e.enumsortorder)
                        FROM pg_enum e WHERE e.enumtypid = t.oid
                    )
                    WHEN 'd' THEN format_type(t.typbasetype, t.typtypmod)::text
                    ELSE NULL
                END AS details
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = $1
           AND t.typtype IN ('e', 'd', 'c', 'r')
           AND (t.typrelid = 0
                OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
         ORDER BY category, name",
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SchemaType {
            name: r.try_get("name").unwrap_or_default(),
            category: r.try_get("category").unwrap_or_default(),
            details: r.try_get::<Option<String>, _>("details").unwrap_or(None),
        })
        .collect())
}

#[tauri::command]
pub async fn get_schema_functions(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SchemaFunction>, String> {
    let pool = pool_for(&connection_id, &state)?;

    let rows = sqlx::query(
        "SELECT p.proname::text AS name,
                CASE p.prokind
                    WHEN 'f' THEN 'function'
                    WHEN 'p' THEN 'procedure'
                    WHEN 'a' THEN 'aggregate'
                    WHEN 'w' THEN 'window'
                    ELSE 'function'
                END AS kind,
                pg_get_function_arguments(p.oid)::text AS arguments,
                COALESCE(pg_get_function_result(p.oid)::text, '') AS return_type,
                l.lanname::text AS language
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
         WHERE n.nspname = $1
         ORDER BY kind, name",
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SchemaFunction {
            name: r.try_get("name").unwrap_or_default(),
            kind: r.try_get("kind").unwrap_or_default(),
            arguments: r.try_get("arguments").unwrap_or_default(),
            return_type: r.try_get("return_type").unwrap_or_default(),
            language: r.try_get("language").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn get_schema_sequences(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SchemaSequence>, String> {
    let pool = pool_for(&connection_id, &state)?;

    let rows = sqlx::query(
        "SELECT s.relname::text AS name,
                seq.seqstart    AS start_value,
                seq.seqincrement AS increment,
                seq.seqmin      AS min_value,
                seq.seqmax      AS max_value,
                seq.seqcycle    AS is_cycle
         FROM pg_class s
         JOIN pg_sequence seq ON seq.seqrelid = s.oid
         JOIN pg_namespace n ON n.oid = s.relnamespace
         WHERE n.nspname = $1 AND s.relkind = 'S'
         ORDER BY s.relname",
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SchemaSequence {
            name: r.try_get("name").unwrap_or_default(),
            start_value: r.try_get("start_value").unwrap_or(1),
            increment: r.try_get("increment").unwrap_or(1),
            min_value: r.try_get("min_value").unwrap_or(1),
            max_value: r.try_get("max_value").unwrap_or(i64::MAX),
            is_cycle: r.try_get("is_cycle").unwrap_or(false),
        })
        .collect())
}
