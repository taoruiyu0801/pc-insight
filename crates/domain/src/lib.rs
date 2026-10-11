use serde::{Deserialize, Serialize};

pub type Ms = i64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub source: String,
    pub start: Ms,
    pub end: Ms,
    pub process: String,
    pub title: String,
    pub domain: String,
    pub intent_id: Option<String>,
    pub role: String,
    pub idle: bool,
    pub area: f64,
}

impl Activity {
    pub fn duration(&self) -> Ms {
        (self.end - self.start).max(0)
    }
    pub fn same_context(&self, other: &Self) -> bool {
        self.source == other.source
            && self.process == other.process
            && self.title == other.title
            && self.domain == other.domain
            && self.intent_id == other.intent_id
            && self.role == other.role
            && self.idle == other.idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub category: String,
    pub color: String,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub field: String,
    pub pattern: String,
    pub category: String,
    pub relation: String,
    pub intent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Correction {
    pub activity_id: String,
    pub category: String,
    pub relation: String,
    #[serde(default)]
    pub override_intent: bool,
    #[serde(default)]
    pub intent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Classified {
    #[serde(flatten)]
    pub activity: Activity,
    pub category: String,
    pub relation: String,
    pub state: String,
    pub confidence: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub intent_id: Option<String>,
    pub start: Ms,
    pub end: Ms,
    pub active_ms: Ms,
    pub focus_ms: Ms,
    pub activity_ids: Vec<String>,
    pub interruption_ms: Ms,
    pub distracted_ms: Ms,
    pub unknown_ms: Ms,
    pub members: Vec<ActivitySpan>,
    pub suggestions: Vec<LearningSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySpan {
    pub activity_id: String,
    pub start: Ms,
    pub end: Ms,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionChange {
    pub category: Option<String>,
    pub relation: Option<String>,
    #[serde(default)]
    pub override_intent: bool,
    pub intent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionRequest {
    pub ranges: Vec<ActivitySpan>,
    pub change: CorrectionChange,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionTotals {
    pub active_ms: Ms,
    pub focus_ms: Ms,
    pub interruption_ms: Ms,
    pub distracted_ms: Ms,
    pub unknown_ms: Ms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionPreview {
    pub token: String,
    pub ranges: Vec<ActivitySpan>,
    pub before: CorrectionTotals,
    pub after: CorrectionTotals,
    pub overwritten_manual_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionBatch {
    pub id: String,
    pub created_at: Ms,
    pub undone_at: Option<Ms>,
    pub label: String,
    pub request: CorrectionRequest,
    pub preview: CorrectionPreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlEvent {
    pub at: Ms,
    pub kind: String,
    pub intent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningSuggestion {
    pub range: ActivitySpan,
    pub tool: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJob {
    pub id: String,
    pub tool: String,
    pub name: String,
    pub project_id: Option<String>,
    pub start: Ms,
    pub end: Option<Ms>,
    pub last_seen: Ms,
    pub status: String,
    #[serde(default)]
    pub foreground_ms: Ms,
    #[serde(default)]
    pub background_ms: Ms,
    #[serde(default)]
    pub parallel_ms: Ms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_collector")]
    pub collector_source: String,
    pub sample_seconds: u64,
    pub idle_seconds: u64,
    pub retention_days: u64,
    pub record_titles: bool,
    pub excluded_apps: Vec<String>,
    pub excluded_titles: Vec<String>,
    pub browser_token: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            collector_source: default_collector(),
            sample_seconds: 2,
            idle_seconds: 180,
            retention_days: 60,
            record_titles: true,
            excluded_apps: vec![],
            excluded_titles: vec![
                "InPrivate".into(),
                "Incognito".into(),
                "隐私浏览".into(),
                "无痕".into(),
            ],
            browser_token: String::new(),
        }
    }
}

fn default_collector() -> String {
    "auto".into()
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub active_ms: Ms,
    pub focus_ms: Ms,
    pub distracted_ms: Ms,
    pub interruption_ms: Ms,
    pub unknown_ms: Ms,
    pub idle_ms: Ms,
    pub deep_ms: Ms,
    pub longest_focus_ms: Ms,
    pub background_ms: Ms,
    pub parallel_ms: Ms,
    pub switches: u32,
    pub distraction_count: u32,
    pub fragmentation: f64,
    pub project_ms: std::collections::BTreeMap<String, Ms>,
    pub category_ms: std::collections::BTreeMap<String, Ms>,
}

pub fn is_category(s: &str) -> bool {
    [
        "learning",
        "coding",
        "research",
        "entertainment",
        "communication",
        "system",
        "unknown",
    ]
    .contains(&s)
}

pub fn is_relation(s: &str) -> bool {
    ["related", "unrelated", "unknown"].contains(&s)
}
