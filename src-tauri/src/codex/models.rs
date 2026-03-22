use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModel {
    pub slug: String,
    pub display_name: String,
    pub default_reasoning_level: Option<String>,
    pub reasoning_levels: Vec<ReasoningLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningLevel {
    pub effort: String,
    pub description: String,
}

#[derive(Deserialize)]
struct ModelsCache {
    models: Vec<RawModel>,
}

#[derive(Deserialize)]
struct RawModel {
    slug: String,
    display_name: String,
    #[serde(default)]
    default_reasoning_level: Option<String>,
    #[serde(default)]
    supported_reasoning_levels: Vec<ReasoningLevel>,
}

pub fn list_models() -> Result<Vec<CodexModel>, String> {
    let path = models_cache_path().ok_or("cannot resolve home directory")?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {}", path.display(), e))?;
    let cache: ModelsCache =
        serde_json::from_str(&raw).map_err(|e| format!("invalid models_cache.json: {e}"))?;

    Ok(cache
        .models
        .into_iter()
        .map(|m| CodexModel {
            slug: m.slug,
            display_name: m.display_name,
            default_reasoning_level: m.default_reasoning_level,
            reasoning_levels: m.supported_reasoning_levels,
        })
        .collect())
}

fn models_cache_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("models_cache.json"))
}
