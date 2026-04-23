use crate::AppState;
use sqlx::Row;

/// Read a single preference value from config DB.
async fn get_pref(pool: &sqlx::SqlitePool, key: &str) -> Option<String> {
    sqlx::query("SELECT value FROM preferences WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<String, _>("value").ok())
}

#[tauri::command]
pub async fn get_ai_settings(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = &state.config_pool;

    let provider = get_pref(pool, "ai_provider").await.unwrap_or_else(|| "openai".to_string());
    let api_key = get_pref(pool, "ai_api_key").await.unwrap_or_default();
    let model = get_pref(pool, "ai_model").await.unwrap_or_else(|| "gpt-4o".to_string());
    let base_url = get_pref(pool, "ai_base_url").await.unwrap_or_default();
    let ai_enabled: bool = get_pref(pool, "ai_enabled")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);
    let air_gapped: bool = get_pref(pool, "ai_air_gapped")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(serde_json::json!({
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
        "ai_enabled": ai_enabled,
        "air_gapped": air_gapped,
    }))
}

#[tauri::command]
pub async fn save_ai_settings(
    provider: String,
    api_key: String,
    model: String,
    base_url: String,
    ai_enabled: bool,
    air_gapped: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pool = &state.config_pool;

    let pairs: &[(&str, String)] = &[
        ("ai_provider", provider),
        ("ai_api_key", api_key),
        ("ai_model", model),
        ("ai_base_url", base_url),
        ("ai_enabled", ai_enabled.to_string()),
        ("ai_air_gapped", air_gapped.to_string()),
    ];

    for (key, value) in pairs {
        sqlx::query("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(value)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn ai_chat_completion(
    messages: Vec<serde_json::Value>,
    _connection_id: Option<String>,
    system_prompt: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let pool = &state.config_pool;

    let air_gapped: bool = get_pref(pool, "ai_air_gapped")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);

    if air_gapped {
        return Err("Air-gapped mode is enabled".to_string());
    }

    let ai_enabled: bool = get_pref(pool, "ai_enabled")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);

    if !ai_enabled {
        return Err("AI features are disabled. Configure in Preferences.".to_string());
    }

    let provider = get_pref(pool, "ai_provider").await.unwrap_or_else(|| "openai".to_string());
    let api_key = get_pref(pool, "ai_api_key").await.unwrap_or_default();
    let model = get_pref(pool, "ai_model").await.unwrap_or_else(|| "gpt-4o".to_string());
    let base_url = get_pref(pool, "ai_base_url")
        .await
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.openai.com".to_string());

    let client = reqwest::Client::new();

    match provider.as_str() {
        "anthropic" => {
            let mut body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "messages": messages,
            });

            if let Some(sys) = system_prompt {
                if !sys.is_empty() {
                    body["system"] = serde_json::Value::String(sys);
                }
            }

            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let resp_json: serde_json::Value =
                resp.json().await.map_err(|e| e.to_string())?;

            resp_json["content"]
                .get(0)
                .and_then(|c| c["text"].as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    resp_json
                        .get("error")
                        .and_then(|e| e["message"].as_str())
                        .unwrap_or("Unexpected response from Anthropic API")
                        .to_string()
                })
        }
        _ => {
            // "openai" or "custom"
            let effective_base = if provider == "openai" {
                "https://api.openai.com".to_string()
            } else {
                base_url.trim_end_matches('/').to_string()
            };

            let mut all_messages: Vec<serde_json::Value> = Vec::new();
            if let Some(sys) = system_prompt {
                if !sys.is_empty() {
                    all_messages.push(serde_json::json!({
                        "role": "system",
                        "content": sys,
                    }));
                }
            }
            all_messages.extend(messages);

            let body = serde_json::json!({
                "model": model,
                "max_tokens": 4096,
                "messages": all_messages,
            });

            let url = format!("{}/v1/chat/completions", effective_base);

            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let resp_json: serde_json::Value =
                resp.json().await.map_err(|e| e.to_string())?;

            resp_json["choices"]
                .get(0)
                .and_then(|c| c["message"]["content"].as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| {
                    resp_json
                        .get("error")
                        .and_then(|e| e["message"].as_str())
                        .unwrap_or("Unexpected response from OpenAI API")
                        .to_string()
                })
        }
    }
}
