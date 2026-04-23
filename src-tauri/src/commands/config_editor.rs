use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize)]
pub struct PgSetting {
    pub name: String,
    pub setting: String,
    pub unit: Option<String>,
    pub category: String,
    pub short_desc: String,
    pub context: String,
    pub vartype: String,
    pub source: String,
    pub min_val: Option<String>,
    pub max_val: Option<String>,
    pub enumvals: Option<Vec<String>>,
    pub boot_val: String,
    pub reset_val: String,
    pub pending_restart: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HbaRule {
    pub line_number: i32,
    pub rule_type: String,
    pub database: Vec<String>,
    pub user_name: Vec<String>,
    pub address: Option<String>,
    pub netmask: Option<String>,
    pub auth_method: String,
    pub options: Option<Vec<String>>,
    pub error: Option<String>,
}

fn split_csv(s: Option<String>) -> Vec<String> {
    s.unwrap_or_default()
        .split(',')
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
        .collect()
}

#[tauri::command]
pub async fn get_pg_settings(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PgSetting>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT name, setting, unit, category, short_desc, context, vartype,
                source, min_val, max_val,
                array_to_string(enumvals, ',') AS enumvals_str,
                boot_val, reset_val, pending_restart
         FROM pg_settings ORDER BY category, name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| {
        let enumvals_str: Option<String> = r.try_get("enumvals_str").unwrap_or(None);
        PgSetting {
            name: r.try_get("name").unwrap_or_default(),
            setting: r.try_get("setting").unwrap_or_default(),
            unit: r.try_get("unit").unwrap_or(None),
            category: r.try_get("category").unwrap_or_default(),
            short_desc: r.try_get("short_desc").unwrap_or_default(),
            context: r.try_get("context").unwrap_or_default(),
            vartype: r.try_get("vartype").unwrap_or_default(),
            source: r.try_get("source").unwrap_or_default(),
            min_val: r.try_get("min_val").unwrap_or(None),
            max_val: r.try_get("max_val").unwrap_or(None),
            enumvals: enumvals_str.filter(|s| !s.is_empty()).map(|s| {
                s.split(',').map(|x| x.to_string()).collect()
            }),
            boot_val: r.try_get("boot_val").unwrap_or_default(),
            reset_val: r.try_get("reset_val").unwrap_or_default(),
            pending_restart: r.try_get("pending_restart").unwrap_or(false),
        }
    }).collect())
}

#[tauri::command]
pub async fn set_pg_setting(
    connection_id: String,
    name: String,
    value: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let sql = format!(
        "ALTER SYSTEM SET {} = '{}'",
        name.replace('"', "\"\""),
        value.replace('\'', "''")
    );
    sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reset_pg_setting(
    connection_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let sql = format!("ALTER SYSTEM RESET {}", name.replace('"', "\"\""));
    sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reload_pg_config(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let row = sqlx::query("SELECT pg_reload_conf() AS result")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.try_get::<bool, _>("result").unwrap_or(false))
}

#[tauri::command]
pub async fn get_hba_rules(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<HbaRule>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT line_number, type AS rule_type,
                array_to_string(database, ',') AS database_str,
                array_to_string(user_name, ',') AS user_name_str,
                address, netmask, auth_method,
                array_to_string(options, ',') AS options_str,
                error
         FROM pg_hba_file_rules ORDER BY line_number",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| HbaRule {
        line_number: r.try_get("line_number").unwrap_or(0),
        rule_type: r.try_get("rule_type").unwrap_or_default(),
        database: split_csv(r.try_get("database_str").unwrap_or(None)),
        user_name: split_csv(r.try_get("user_name_str").unwrap_or(None)),
        address: r.try_get("address").unwrap_or(None),
        netmask: r.try_get("netmask").unwrap_or(None),
        auth_method: r.try_get("auth_method").unwrap_or_default(),
        options: {
            let s: Option<String> = r.try_get("options_str").unwrap_or(None);
            s.filter(|x| !x.is_empty()).map(|x| x.split(',').map(|s| s.to_string()).collect())
        },
        error: r.try_get("error").unwrap_or(None),
    }).collect())
}
