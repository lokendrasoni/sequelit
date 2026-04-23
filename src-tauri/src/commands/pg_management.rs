use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize)]
pub struct RlsPolicy {
    pub schemaname: String,
    pub tablename: String,
    pub policyname: String,
    pub permissive: String,
    pub roles: Vec<String>,
    pub cmd: String,
    pub qual: Option<String>,
    pub with_check: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PartitionInfo {
    pub partition_name: String,
    pub partition_schema: String,
    pub partition_type: String,
    pub partition_bound: String,
    pub parent_table: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Publication {
    pub pubname: String,
    pub puballtables: bool,
    pub pubinsert: bool,
    pub pubupdate: bool,
    pub pubdelete: bool,
    pub pubtruncate: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Subscription {
    pub subname: String,
    pub subenabled: bool,
    pub subpublications: Vec<String>,
    pub substatus: String,
}

fn split_comma(s: Option<String>) -> Vec<String> {
    s.unwrap_or_default()
        .split(',')
        .filter(|x| !x.is_empty())
        .map(|x| x.trim().to_string())
        .collect()
}

#[tauri::command]
pub async fn get_rls_policies(
    connection_id: String,
    schema: Option<String>,
    table: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RlsPolicy>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = match (&schema, &table) {
        (Some(s), Some(t)) => sqlx::query(
            "SELECT schemaname::text, tablename::text, policyname::text, permissive, \
                    array_to_string(roles, ',') AS roles_str, cmd, qual, with_check \
             FROM pg_policies WHERE schemaname = $1 AND tablename = $2 \
             ORDER BY schemaname, tablename, policyname",
        )
        .bind(s)
        .bind(t)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,
        _ => sqlx::query(
            "SELECT schemaname::text, tablename::text, policyname::text, permissive, \
                    array_to_string(roles, ',') AS roles_str, cmd, qual, with_check \
             FROM pg_policies ORDER BY schemaname, tablename, policyname",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,
    };

    Ok(rows
        .iter()
        .map(|r| RlsPolicy {
            schemaname: r.try_get("schemaname").unwrap_or_default(),
            tablename: r.try_get("tablename").unwrap_or_default(),
            policyname: r.try_get("policyname").unwrap_or_default(),
            permissive: r.try_get("permissive").unwrap_or_default(),
            roles: split_comma(r.try_get("roles_str").unwrap_or(None)),
            cmd: r.try_get("cmd").unwrap_or_default(),
            qual: r.try_get("qual").unwrap_or(None),
            with_check: r.try_get("with_check").unwrap_or(None),
        })
        .collect())
}

#[tauri::command]
pub async fn enable_rls(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let sql = format!(
        "ALTER TABLE \"{}\".\"{}\" ENABLE ROW LEVEL SECURITY",
        schema.replace('"', "\"\""),
        table.replace('"', "\"\"")
    );
    sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn disable_rls(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let sql = format!(
        "ALTER TABLE \"{}\".\"{}\" DISABLE ROW LEVEL SECURITY",
        schema.replace('"', "\"\""),
        table.replace('"', "\"\"")
    );
    sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_partitions(
    connection_id: String,
    schema: Option<String>,
    table: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PartitionInfo>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = match (&schema, &table) {
        (Some(s), Some(t)) => sqlx::query(
            "SELECT c.relname::text AS partition_name, \
                    n.nspname::text AS partition_schema, \
                    CASE p.partstrat \
                        WHEN 'r' THEN 'RANGE' \
                        WHEN 'l' THEN 'LIST' \
                        WHEN 'h' THEN 'HASH' \
                        ELSE 'UNKNOWN' \
                    END AS partition_type, \
                    pg_get_expr(c.relpartbound, c.oid) AS partition_bound, \
                    pp.relname::text AS parent_table \
             FROM pg_inherits i \
             JOIN pg_class c ON c.oid = i.inhrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             JOIN pg_partitioned_table pt ON pt.partrelid = i.inhparent \
             JOIN pg_class p ON p.oid = i.inhparent \
             LEFT JOIN pg_class pp ON pp.oid = pt.partrelid \
             LEFT JOIN pg_namespace np ON np.oid = pp.relnamespace \
             WHERE np.nspname = $1 AND pp.relname = $2",
        )
        .bind(s)
        .bind(t)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,
        _ => sqlx::query(
            "SELECT c.relname::text AS partition_name, \
                    n.nspname::text AS partition_schema, \
                    CASE p.partstrat \
                        WHEN 'r' THEN 'RANGE' \
                        WHEN 'l' THEN 'LIST' \
                        WHEN 'h' THEN 'HASH' \
                        ELSE 'UNKNOWN' \
                    END AS partition_type, \
                    pg_get_expr(c.relpartbound, c.oid) AS partition_bound, \
                    pp.relname::text AS parent_table \
             FROM pg_inherits i \
             JOIN pg_class c ON c.oid = i.inhrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             JOIN pg_partitioned_table pt ON pt.partrelid = i.inhparent \
             JOIN pg_class p ON p.oid = i.inhparent \
             LEFT JOIN pg_class pp ON pp.oid = pt.partrelid \
             LEFT JOIN pg_namespace np ON np.oid = pp.relnamespace \
             ORDER BY np.nspname, pp.relname, c.relname",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?,
    };

    Ok(rows
        .iter()
        .map(|r| PartitionInfo {
            partition_name: r.try_get("partition_name").unwrap_or_default(),
            partition_schema: r.try_get("partition_schema").unwrap_or_default(),
            partition_type: r.try_get("partition_type").unwrap_or_default(),
            partition_bound: r.try_get("partition_bound").unwrap_or_default(),
            parent_table: r.try_get("parent_table").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn get_publications(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Publication>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT pubname::text, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate \
         FROM pg_publication",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| Publication {
            pubname: r.try_get("pubname").unwrap_or_default(),
            puballtables: r.try_get("puballtables").unwrap_or(false),
            pubinsert: r.try_get("pubinsert").unwrap_or(false),
            pubupdate: r.try_get("pubupdate").unwrap_or(false),
            pubdelete: r.try_get("pubdelete").unwrap_or(false),
            pubtruncate: r.try_get("pubtruncate").unwrap_or(false),
        })
        .collect())
}

#[tauri::command]
pub async fn get_subscriptions(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Subscription>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT subname::text, subenabled, \
                array_to_string(subpublications, ',') AS pubs \
         FROM pg_subscription",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            let enabled: bool = r.try_get("subenabled").unwrap_or(false);
            Subscription {
                subname: r.try_get("subname").unwrap_or_default(),
                subenabled: enabled,
                subpublications: split_comma(r.try_get("pubs").unwrap_or(None)),
                substatus: if enabled {
                    "enabled".to_string()
                } else {
                    "disabled".to_string()
                },
            }
        })
        .collect())
}

#[tauri::command]
pub async fn drop_rls_policy(
    connection_id: String,
    schema: String,
    table: String,
    policy_name: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let sql = format!(
        "DROP POLICY \"{}\" ON \"{}\".\"{}\"",
        policy_name.replace('"', "\"\""),
        schema.replace('"', "\"\""),
        table.replace('"', "\"\"")
    );
    sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
