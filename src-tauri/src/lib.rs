mod commands;
mod config;
mod crypto;
mod db;
mod session;

use commands::ai::*;
use commands::config_editor::*;
use commands::connections::*;
use commands::extras::*;
use commands::jobs::*;
use commands::monitoring::*;
use commands::pg_management::*;
use commands::query::*;
use commands::roles::*;
use commands::saved_queries::*;
use commands::schema::*;
use commands::workspace::*;
use db::PoolMap;
use session::SessionMap;
use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppStateInner {
    pub db_pools: PoolMap,
    pub config_pool: SqlitePool,
    pub encryption_key: Vec<u8>,
    pub sessions: SessionMap,
    pub ssh_tunnels: std::sync::Mutex<std::collections::HashMap<String, std::process::Child>>,
    pub ssh_ports: std::sync::Mutex<std::collections::HashMap<String, u16>>,
    pub browse_pools: db::PoolMap,
}

/// All Tauri commands and AppHandle state use this alias.
/// The Arc lets background tasks and window-close handlers share it without lifetime issues.
pub type AppState = std::sync::Arc<AppStateInner>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                // Determine data directory
                let data_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("Could not resolve app data dir");
                std::fs::create_dir_all(&data_dir).expect("Could not create data dir");

                // Load or create encryption key
                let key_path = data_dir.join(".key");
                let encryption_key =
                    crypto::load_or_create_key(&key_path).expect("Could not load encryption key");

                // Open config SQLite database
                let db_path = data_dir.join("config.db");
                let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
                sqlx::any::install_default_drivers();
                let config_pool = SqlitePool::connect(&db_url)
                    .await
                    .expect("Could not open config database");

                // Run migrations
                config::init_config_db(&config_pool)
                    .await
                    .expect("Could not initialize config database");

                let state: AppState = std::sync::Arc::new(AppStateInner {
                    db_pools: db::new_pool_map(),
                    config_pool,
                    encryption_key,
                    sessions: session::new_session_map(),
                    ssh_tunnels: std::sync::Mutex::new(std::collections::HashMap::new()),
                    ssh_ports: std::sync::Mutex::new(std::collections::HashMap::new()),
                    browse_pools: db::new_pool_map(),
                });

                // Clone the Arc for the background idle-cleanup task.
                let bg_state = state.clone();
                app_handle.manage(state);

                // Background task: close idle (expired) connections every 60 seconds.
                tauri::async_runtime::spawn(async move {
                    loop {
                        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

                        let expired_ids: Vec<String> = bg_state
                            .sessions
                            .lock()
                            .unwrap()
                            .iter()
                            .filter(|(_, s)| s.is_expired())
                            .map(|(id, _)| id.clone())
                            .collect();

                        for id in &expired_ids {
                            // Sync cleanup first — no await while holding these.
                            let pool = {
                                let pool = bg_state.db_pools.lock().unwrap().remove(id);
                                bg_state.sessions.lock().unwrap().remove(id);
                                if let Some(mut child) = bg_state.ssh_tunnels.lock().unwrap().remove(id) {
                                    let _ = child.kill();
                                }
                                bg_state.ssh_ports.lock().unwrap().remove(id);
                                let prefix = format!("{}::", id);
                                bg_state.browse_pools.lock().unwrap().retain(|k, _| !k.starts_with(&prefix));
                                pool
                            };
                            if let Some(p) = pool {
                                p.close().await;
                            }
                        }
                    }
                });
            });
            Ok(())
        })
        // Close all connections when the window is destroyed (app quit without disconnecting).
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<AppState>();

                // Kill SSH tunnels synchronously — these are OS processes.
                for (_, mut child) in state.ssh_tunnels.lock().unwrap().drain() {
                    let _ = child.kill();
                }
                state.ssh_ports.lock().unwrap().clear();
                state.sessions.lock().unwrap().clear();

                // Drain pools; spawn async close so the server receives a proper FIN.
                let pools: Vec<_> = state
                    .db_pools
                    .lock()
                    .unwrap()
                    .drain()
                    .map(|(_, p)| p)
                    .collect();
                let browse: Vec<_> = state
                    .browse_pools
                    .lock()
                    .unwrap()
                    .drain()
                    .map(|(_, p)| p)
                    .collect();

                tauri::async_runtime::spawn(async move {
                    for p in pools.into_iter().chain(browse) {
                        p.close().await;
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Connection management
            get_connections,
            save_connection,
            delete_connection,
            test_connection,
            connect,
            disconnect,
            get_session_info,
            touch_session,
            // Query
            run_query,
            get_query_history,
            fetch_table_rows,
            delete_table_row,
            update_table_cell,
            // Schema
            get_databases,
            get_schemas,
            get_tables,
            get_table_detail,
            // Saved queries
            save_query,
            get_saved_queries,
            delete_saved_query,
            // Extras
            explain_query,
            diff_schemas,
            get_fk_relationships,
            import_csv,
            export_tables_csv,
            get_pg_dump_cmd,
            get_pg_restore_cmd,
            // Monitoring & dashboard
            get_pg_activity,
            cancel_backend,
            terminate_backend,
            get_dashboard_stats,
            get_table_stats,
            // Roles
            get_roles,
            create_role,
            drop_role,
            get_role_memberships,
            grant_role,
            revoke_role,
            // Config editor
            get_pg_settings,
            set_pg_setting,
            reset_pg_setting,
            reload_pg_config,
            get_hba_rules,
            // Jobs
            get_jobs,
            save_job,
            delete_job,
            toggle_job,
            run_job_now,
            // AI
            get_ai_settings,
            save_ai_settings,
            ai_chat_completion,
            // Workspace
            export_workspace,
            import_workspace,
            // PG Management
            get_rls_policies,
            enable_rls,
            disable_rls,
            get_partitions,
            get_publications,
            get_subscriptions,
            drop_rls_policy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sequelit");
}
