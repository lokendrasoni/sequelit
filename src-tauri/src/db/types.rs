use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Postgres,
    Mysql,
    Sqlite,
    Cockroachdb,
    Redshift,
}

impl std::fmt::Display for DbType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbType::Postgres => write!(f, "postgres"),
            DbType::Mysql => write!(f, "mysql"),
            DbType::Sqlite => write!(f, "sqlite"),
            DbType::Cockroachdb => write!(f, "cockroachdb"),
            DbType::Redshift => write!(f, "redshift"),
        }
    }
}

impl DbType {
    pub fn default_port(&self) -> u16 {
        match self {
            DbType::Postgres => 5432,
            DbType::Mysql => 3306,
            DbType::Sqlite => 0,
            DbType::Cockroachdb => 26257,
            DbType::Redshift => 5439,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectionConfig {
    pub id: Option<String>,
    pub name: String,
    pub db_type: DbType,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>, // plaintext, only in transit — encrypted at rest
    pub ssl_mode: Option<String>,
    pub ssh_host: Option<String>,
    pub ssh_user: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_key_path: Option<String>,
    pub color_tag: Option<String>,
    pub group_name: Option<String>,
    pub read_only: Option<bool>,
}

/// Percent-encode a string for use in a URL userinfo segment.
/// Encodes everything except unreserved chars (A-Z a-z 0-9 - _ . ~).
fn pct_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => { let _ = std::fmt::Write::write_fmt(&mut out, format_args!("%{:02X}", b)); }
        }
    }
    out
}

impl ConnectionConfig {
    pub fn build_url(&self) -> String {
        match self.db_type {
            DbType::Postgres | DbType::Cockroachdb | DbType::Redshift => {
                let host = self.host.as_deref().unwrap_or("localhost");
                let port = self.port.unwrap_or(match self.db_type {
                    DbType::Cockroachdb => 26257,
                    DbType::Redshift => 5439,
                    _ => 5432,
                });
                let db = self.database.as_deref().unwrap_or("postgres");
                let user = pct_encode(self.username.as_deref().unwrap_or("postgres"));
                let pass = pct_encode(self.password.as_deref().unwrap_or(""));
                format!("postgres://{}:{}@{}:{}/{}", user, pass, host, port, db)
            }
            DbType::Mysql => {
                let host = self.host.as_deref().unwrap_or("localhost");
                let port = self.port.unwrap_or(3306);
                let db = self.database.as_deref().unwrap_or("");
                let user = pct_encode(self.username.as_deref().unwrap_or("root"));
                let pass = pct_encode(self.password.as_deref().unwrap_or(""));
                format!("mysql://{}:{}@{}:{}/{}", user, pass, host, port, db)
            }
            DbType::Sqlite => {
                let path = self.database.as_deref().unwrap_or(":memory:");
                format!("sqlite:{}", path)
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub db_type: String,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub ssl_mode: Option<String>,
    pub ssh_host: Option<String>,
    pub ssh_user: Option<String>,
    pub ssh_port: Option<i64>,
    pub ssh_key_path: Option<String>,
    pub color_tag: Option<String>,
    pub group_name: Option<String>,
    pub read_only: bool,
    pub last_used: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: u64,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub name: String,
    pub tables: Vec<TableInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub table_type: String, // TABLE, VIEW, MATERIALIZED VIEW
    pub row_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnDetail {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub is_primary_key: bool,
    pub is_unique: bool,
    pub ordinal_position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableDetail {
    pub schema: String,
    pub name: String,
    pub columns: Vec<ColumnDetail>,
    pub indexes: Vec<IndexInfo>,
    pub ddl: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
}
