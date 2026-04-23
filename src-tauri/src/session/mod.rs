use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

pub const SESSION_TIMEOUT_SECS: i64 = 3600; // 1 hour

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub connection_id: String,
    pub last_activity: DateTime<Utc>,
    pub timeout_secs: i64,
}

impl Session {
    pub fn new(connection_id: String) -> Self {
        Self {
            connection_id,
            last_activity: Utc::now(),
            timeout_secs: SESSION_TIMEOUT_SECS,
        }
    }

    pub fn touch(&mut self) {
        self.last_activity = Utc::now();
    }

    pub fn seconds_remaining(&self) -> i64 {
        let elapsed = Utc::now()
            .signed_duration_since(self.last_activity)
            .num_seconds();
        (self.timeout_secs - elapsed).max(0)
    }

    pub fn is_expired(&self) -> bool {
        self.seconds_remaining() == 0
    }
}

pub type SessionMap = Mutex<HashMap<String, Session>>;

pub fn new_session_map() -> SessionMap {
    Mutex::new(HashMap::new())
}
