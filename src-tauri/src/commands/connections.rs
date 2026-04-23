use crate::db::{open_pool, types::*};
use crate::session::Session;
use crate::AppState;
use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

fn find_free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

async fn spawn_ssh_tunnel(config: &ConnectionConfig) -> Result<(std::process::Child, u16), String> {
    let ssh_host = config.ssh_host.as_deref().ok_or("SSH host is required")?;
    let ssh_user = config.ssh_user.as_deref().unwrap_or("root");
    let ssh_port = config.ssh_port.unwrap_or(22);
    let remote_host = config.host.as_deref().unwrap_or("localhost");
    let remote_port = config.port.unwrap_or_else(|| config.db_type.default_port());
    let local_port = find_free_port()?;

    let forward = format!("{}:{}:{}", local_port, remote_host, remote_port);

    let mut cmd = std::process::Command::new("ssh");
    cmd.args([
        "-L", &forward,
        "-N",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ExitOnForwardFailure=yes",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-p", &ssh_port.to_string(),
    ]);

    if let Some(key) = &config.ssh_key_path {
        if !key.is_empty() {
            cmd.args(["-i", key]);
        }
    }

    cmd.arg(format!("{}@{}", ssh_user, ssh_host));
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start SSH: {}", e))?;

    // Poll until the tunnel port is accepting connections (up to 10 s)
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("SSH process exited early ({})", status));
        }
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", local_port)).is_ok() {
            break;
        }
        if std::time::Instant::now() > deadline {
            let _ = child.kill();
            return Err("SSH tunnel did not become ready within 10 seconds".to_string());
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    Ok((child, local_port))
}

#[tauri::command]
pub async fn get_connections(state: tauri::State<'_, AppState>) -> Result<Vec<SavedConnection>, String> {
    let rows = sqlx::query(
        "SELECT id, name, db_type, host, port, database, username, ssl_mode,
                ssh_host, ssh_user, ssh_port, ssh_key_path,
                color_tag, group_name, read_only, created_at, last_used
         FROM connections ORDER BY name",
    )
    .fetch_all(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SavedConnection {
            id: r.try_get("id").unwrap_or_default(),
            name: r.try_get("name").unwrap_or_default(),
            db_type: r.try_get("db_type").unwrap_or_default(),
            host: r.try_get("host").unwrap_or(None),
            port: r.try_get("port").unwrap_or(None),
            database: r.try_get("database").unwrap_or(None),
            username: r.try_get("username").unwrap_or(None),
            ssl_mode: r.try_get("ssl_mode").unwrap_or(None),
            ssh_host: r.try_get("ssh_host").unwrap_or(None),
            ssh_user: r.try_get("ssh_user").unwrap_or(None),
            ssh_port: r.try_get("ssh_port").unwrap_or(None),
            ssh_key_path: r.try_get("ssh_key_path").unwrap_or(None),
            color_tag: r.try_get("color_tag").unwrap_or(None),
            group_name: r.try_get("group_name").unwrap_or(None),
            read_only: r.try_get::<i64, _>("read_only").unwrap_or(0) == 1,
            created_at: r.try_get("created_at").unwrap_or_default(),
            last_used: r.try_get("last_used").unwrap_or(None),
        })
        .collect())
}

#[tauri::command]
pub async fn save_connection(
    config: ConnectionConfig,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let id = config.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO connections (id, name, db_type, host, port, database, username, ssl_mode,
                                  ssh_host, ssh_user, ssh_port, ssh_key_path,
                                  color_tag, group_name, read_only, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, db_type=excluded.db_type, host=excluded.host,
           port=excluded.port, database=excluded.database, username=excluded.username,
           ssl_mode=excluded.ssl_mode,
           ssh_host=excluded.ssh_host, ssh_user=excluded.ssh_user,
           ssh_port=excluded.ssh_port, ssh_key_path=excluded.ssh_key_path,
           color_tag=excluded.color_tag, group_name=excluded.group_name,
           read_only=excluded.read_only",
    )
    .bind(&id)
    .bind(&config.name)
    .bind(config.db_type.to_string())
    .bind(&config.host)
    .bind(config.port.map(|p| p as i64))
    .bind(&config.database)
    .bind(&config.username)
    .bind(&config.ssl_mode)
    .bind(&config.ssh_host)
    .bind(&config.ssh_user)
    .bind(config.ssh_port.map(|p| p as i64))
    .bind(&config.ssh_key_path)
    .bind(&config.color_tag)
    .bind(&config.group_name)
    .bind(config.read_only.unwrap_or(false) as i64)
    .bind(&now)
    .execute(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(password) = &config.password {
        if !password.is_empty() {
            let secrets = serde_json::json!({ "password": password }).to_string();
            let encrypted = crate::crypto::encrypt(&secrets, &state.encryption_key)
                .map_err(|e| e.to_string())?;
            sqlx::query(
                "INSERT INTO connection_secrets (connection_id, encrypted_blob) VALUES (?, ?)
                 ON CONFLICT(connection_id) DO UPDATE SET encrypted_blob=excluded.encrypted_blob",
            )
            .bind(&id)
            .bind(&encrypted)
            .execute(&state.config_pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(id)
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = {
        let mut pools = state.db_pools.lock().unwrap();
        pools.remove(&id)
    };
    if let Some(p) = pool {
        p.close().await;
    }

    // Kill any active SSH tunnel
    if let Some(mut child) = state.ssh_tunnels.lock().unwrap().remove(&id) {
        let _ = child.kill();
    }
    state.ssh_ports.lock().unwrap().remove(&id);
    state.browse_pools.lock().unwrap()
        .retain(|k, _| !k.starts_with(&format!("{}::", id)));

    sqlx::query("DELETE FROM connections WHERE id = ?")
        .bind(&id)
        .execute(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    config: ConnectionConfig,
    _state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if config.ssh_host.is_some() {
        let (mut child, local_port) = spawn_ssh_tunnel(&config).await?;
        let mut tunnel_config = config.clone();
        tunnel_config.host = Some("127.0.0.1".to_string());
        tunnel_config.port = Some(local_port);
        let url = tunnel_config.build_url();
        let result = match open_pool(&url).await {
            Ok(pool) => {
                pool.close().await;
                Ok("Connection successful (via SSH tunnel)".to_string())
            }
            Err(e) => Err(e.to_string()),
        };
        let _ = child.kill();
        result
    } else {
        let url = config.build_url();
        match open_pool(&url).await {
            Ok(pool) => {
                pool.close().await;
                Ok("Connection successful".to_string())
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub async fn connect(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        let pools = state.db_pools.lock().unwrap();
        if pools.contains_key(&id) {
            return Ok(());
        }
    }

    let row = sqlx::query(
        "SELECT db_type, host, port, database, username, ssl_mode,
                ssh_host, ssh_user, ssh_port, ssh_key_path
         FROM connections WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.config_pool)
    .await
    .map_err(|e| e.to_string())?;

    let db_type_str: String = row.try_get("db_type").unwrap_or_default();
    let host: Option<String> = row.try_get("host").unwrap_or(None);
    let port: Option<i64> = row.try_get("port").unwrap_or(None);
    let database: Option<String> = row.try_get("database").unwrap_or(None);
    let username: Option<String> = row.try_get("username").unwrap_or(None);
    let ssh_host: Option<String> = row.try_get("ssh_host").unwrap_or(None);
    let ssh_user: Option<String> = row.try_get("ssh_user").unwrap_or(None);
    let ssh_port: Option<i64> = row.try_get("ssh_port").unwrap_or(None);
    let ssh_key_path: Option<String> = row.try_get("ssh_key_path").unwrap_or(None);

    let password = {
        let secret_row = sqlx::query(
            "SELECT encrypted_blob FROM connection_secrets WHERE connection_id = ?",
        )
        .bind(&id)
        .fetch_optional(&state.config_pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(r) = secret_row {
            let blob: String = r.try_get("encrypted_blob").unwrap_or_default();
            let decrypted = crate::crypto::decrypt(&blob, &state.encryption_key)
                .map_err(|e| e.to_string())?;
            let json: serde_json::Value =
                serde_json::from_str(&decrypted).map_err(|e| e.to_string())?;
            json["password"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    };

    let config = ConnectionConfig {
        id: Some(id.clone()),
        name: String::new(),
        db_type: match db_type_str.as_str() {
            "postgres" => DbType::Postgres,
            "mysql" => DbType::Mysql,
            "cockroachdb" => DbType::Cockroachdb,
            "redshift" => DbType::Redshift,
            _ => DbType::Sqlite,
        },
        host,
        port: port.map(|p| p as u16),
        database,
        username,
        password,
        ssl_mode: None,
        ssh_host,
        ssh_user,
        ssh_port: ssh_port.map(|p| p as u16),
        ssh_key_path,
        color_tag: None,
        group_name: None,
        read_only: Some(false),
    };

    // Spawn SSH tunnel if configured, then connect through it
    let (ssh_child, ssh_local_port, effective_config) = if config.ssh_host.is_some() {
        match spawn_ssh_tunnel(&config).await {
            Ok((child, local_port)) => {
                let mut c = config.clone();
                c.host = Some("127.0.0.1".to_string());
                c.port = Some(local_port);
                (Some(child), Some(local_port), c)
            }
            Err(e) => return Err(e),
        }
    } else {
        (None, None, config.clone())
    };

    let url = effective_config.build_url();
    let pool = match open_pool(&url).await {
        Ok(p) => p,
        Err(e) => {
            if let Some(mut child) = ssh_child {
                let _ = child.kill();
            }
            return Err(e.to_string());
        }
    };

    {
        let mut pools = state.db_pools.lock().unwrap();
        pools.insert(id.clone(), pool);
    }

    if let Some(child) = ssh_child {
        state.ssh_tunnels.lock().unwrap().insert(id.clone(), child);
    }
    if let Some(port) = ssh_local_port {
        state.ssh_ports.lock().unwrap().insert(id.clone(), port);
    }

    state.sessions.lock().unwrap().insert(id.clone(), Session::new(id.clone()));

    let now = chrono::Utc::now().to_rfc3339();
    let config_pool = state.config_pool.clone();
    let id_clone = id.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE connections SET last_used = ? WHERE id = ?")
            .bind(&now)
            .bind(&id_clone)
            .execute(&config_pool)
            .await;
    });

    Ok(())
}

#[tauri::command]
pub async fn disconnect(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let pool = {
        let mut pools = state.db_pools.lock().unwrap();
        pools.remove(&id)
    };
    if let Some(p) = pool {
        p.close().await;
    }

    state.sessions.lock().unwrap().remove(&id);

    // Kill SSH tunnel if active
    if let Some(mut child) = state.ssh_tunnels.lock().unwrap().remove(&id) {
        let _ = child.kill();
    }
    state.ssh_ports.lock().unwrap().remove(&id);

    // Drop all browse pools for this connection
    state.browse_pools.lock().unwrap()
        .retain(|k, _| !k.starts_with(&format!("{}::", id)));

    Ok(())
}

#[tauri::command]
pub async fn get_session_info(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        Ok(serde_json::json!({
            "connected": true,
            "seconds_remaining": session.seconds_remaining(),
            "expired": session.is_expired(),
        }))
    } else {
        Ok(serde_json::json!({ "connected": false }))
    }
}

#[tauri::command]
pub async fn touch_session(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session.touch();
    }
    Ok(())
}
