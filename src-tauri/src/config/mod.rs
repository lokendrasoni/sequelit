use anyhow::Result;
use sqlx::SqlitePool;

pub async fn init_config_db(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            db_type     TEXT NOT NULL,
            host        TEXT,
            port        INTEGER,
            database    TEXT,
            username    TEXT,
            ssl_mode    TEXT,
            color_tag   TEXT,
            group_name  TEXT,
            read_only   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            last_used   TEXT
        );
        "#,
    )
    .execute(pool)
    .await?;

    // Migrations: add SSH columns if not already present (errors = column exists, safe to ignore)
    for sql in &[
        "ALTER TABLE connections ADD COLUMN ssh_host TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_user TEXT",
        "ALTER TABLE connections ADD COLUMN ssh_port INTEGER",
        "ALTER TABLE connections ADD COLUMN ssh_key_path TEXT",
    ] {
        let _ = sqlx::query(sql).execute(pool).await;
    }

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS connection_secrets (
            connection_id TEXT PRIMARY KEY,
            encrypted_blob TEXT NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS query_history (
            id          TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            sql         TEXT NOT NULL,
            executed_at TEXT NOT NULL,
            duration_ms INTEGER,
            error       TEXT
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS saved_queries (
            id          TEXT PRIMARY KEY,
            connection_id TEXT,
            name        TEXT NOT NULL,
            sql         TEXT NOT NULL,
            description TEXT,
            tags        TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS jobs (
            id          TEXT PRIMARY KEY,
            connection_id TEXT,
            name        TEXT NOT NULL,
            sql         TEXT NOT NULL,
            schedule    TEXT NOT NULL,
            enabled     INTEGER NOT NULL DEFAULT 1,
            last_run    TEXT,
            last_status TEXT,
            created_at  TEXT NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS preferences (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
