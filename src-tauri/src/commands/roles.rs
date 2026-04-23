use crate::AppState;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Debug, Serialize, Deserialize)]
pub struct PgRole {
    pub rolname: String,
    pub rolsuper: bool,
    pub rolinherit: bool,
    pub rolcreaterole: bool,
    pub rolcreatedb: bool,
    pub rolcanlogin: bool,
    pub rolreplication: bool,
    pub rolbypassrls: bool,
    pub rolconnlimit: i32,
    pub rolvaliduntil: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoleMembership {
    pub role: String,
    pub member: String,
    pub granted_by: String,
    pub admin_option: bool,
}

#[tauri::command]
pub async fn get_roles(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PgRole>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT rolname::text, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
                rolcanlogin, rolreplication, rolbypassrls, rolconnlimit,
                rolvaliduntil::text
         FROM pg_roles ORDER BY rolname",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| PgRole {
        rolname: r.try_get("rolname").unwrap_or_default(),
        rolsuper: r.try_get("rolsuper").unwrap_or(false),
        rolinherit: r.try_get("rolinherit").unwrap_or(false),
        rolcreaterole: r.try_get("rolcreaterole").unwrap_or(false),
        rolcreatedb: r.try_get("rolcreatedb").unwrap_or(false),
        rolcanlogin: r.try_get("rolcanlogin").unwrap_or(false),
        rolreplication: r.try_get("rolreplication").unwrap_or(false),
        rolbypassrls: r.try_get("rolbypassrls").unwrap_or(false),
        rolconnlimit: r.try_get("rolconnlimit").unwrap_or(-1),
        rolvaliduntil: r.try_get("rolvaliduntil").unwrap_or(None),
    }).collect())
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleOptions {
    pub name: String,
    pub password: Option<String>,
    pub superuser: bool,
    pub createdb: bool,
    pub createrole: bool,
    pub inherit: bool,
    pub login: bool,
    pub replication: bool,
    pub bypass_rls: bool,
    pub conn_limit: Option<i32>,
    pub valid_until: Option<String>,
}

#[tauri::command]
pub async fn create_role(
    connection_id: String,
    options: CreateRoleOptions,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let mut clauses = Vec::new();
    if options.superuser { clauses.push("SUPERUSER".to_string()); } else { clauses.push("NOSUPERUSER".to_string()); }
    if options.createdb { clauses.push("CREATEDB".to_string()); } else { clauses.push("NOCREATEDB".to_string()); }
    if options.createrole { clauses.push("CREATEROLE".to_string()); } else { clauses.push("NOCREATEROLE".to_string()); }
    if options.inherit { clauses.push("INHERIT".to_string()); } else { clauses.push("NOINHERIT".to_string()); }
    if options.login { clauses.push("LOGIN".to_string()); } else { clauses.push("NOLOGIN".to_string()); }
    if options.replication { clauses.push("REPLICATION".to_string()); } else { clauses.push("NOREPLICATION".to_string()); }
    if options.bypass_rls { clauses.push("BYPASSRLS".to_string()); } else { clauses.push("NOBYPASSRLS".to_string()); }
    if let Some(limit) = options.conn_limit {
        clauses.push(format!("CONNECTION LIMIT {}", limit));
    }
    if let Some(ref pw) = options.password {
        if !pw.is_empty() {
            clauses.push(format!("PASSWORD '{}'", pw.replace('\'', "''")));
        }
    }
    if let Some(ref until) = options.valid_until {
        if !until.is_empty() {
            clauses.push(format!("VALID UNTIL '{}'", until.replace('\'', "''")));
        }
    }

    let sql = format!(
        "CREATE ROLE \"{}\" {}",
        options.name.replace('"', "\"\""),
        clauses.join(" ")
    );
    sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn drop_role(
    connection_id: String,
    name: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let sql = format!("DROP ROLE \"{}\"", name.replace('"', "\"\""));
    sqlx::query(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_role_memberships(
    connection_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RoleMembership>, String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };

    let rows = sqlx::query(
        "SELECT r.rolname::text AS role, m.rolname::text AS member,
                g.rolname::text AS granted_by, a.admin_option
         FROM pg_auth_members a
         JOIN pg_roles r ON r.oid = a.roleid
         JOIN pg_roles m ON m.oid = a.member
         JOIN pg_roles g ON g.oid = a.grantor
         ORDER BY r.rolname, m.rolname",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|r| RoleMembership {
        role: r.try_get("role").unwrap_or_default(),
        member: r.try_get("member").unwrap_or_default(),
        granted_by: r.try_get("granted_by").unwrap_or_default(),
        admin_option: r.try_get("admin_option").unwrap_or(false),
    }).collect())
}

#[tauri::command]
pub async fn grant_role(
    connection_id: String,
    role: String,
    member: String,
    admin_option: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let with_admin = if admin_option { " WITH ADMIN OPTION" } else { "" };
    let sql = format!(
        "GRANT \"{}\" TO \"{}\"{}",
        role.replace('"', "\"\""),
        member.replace('"', "\"\""),
        with_admin
    );
    sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn revoke_role(
    connection_id: String,
    role: String,
    member: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let pools = state.db_pools.lock().unwrap();
        pools.get(&connection_id).ok_or("Not connected")?.clone()
    };
    let sql = format!(
        "REVOKE \"{}\" FROM \"{}\"",
        role.replace('"', "\"\""),
        member.replace('"', "\"\""),
    );
    sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
