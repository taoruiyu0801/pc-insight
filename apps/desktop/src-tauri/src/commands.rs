use crate::{
    runtime::{id, now},
    Shared,
};
use pc_domain::*;
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    collector_source: String,
    aw_status: String,
    activities: Vec<Classified>,
    sessions: Vec<Session>,
    jobs: Vec<BackgroundJob>,
    stats: Stats,
    projects: Vec<Project>,
    rules: Vec<Rule>,
    settings: Settings,
    recording: bool,
    breaking: bool,
    intent_id: Option<String>,
    last_sample: Option<Ms>,
    current_app: Option<String>,
    error: Option<String>,
    bridge_ready: bool,
    bridge_error: Option<String>,
    browser_connected: bool,
    database_path: String,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn period(start: Ms, end: Ms) -> Result<(), String> {
    if end <= start || end - start > 32 * 86_400_000 {
        Err("日期范围必须在 1–32 天内".into())
    } else {
        Ok(())
    }
}
fn valid_text(s: &str, max: usize) -> bool {
    !s.trim().is_empty() && s.chars().count() <= max
}

#[tauri::command]
pub fn snapshot(state: State<Shared>, start: Ms, end: Ms) -> Result<Snapshot, String> {
    period(start, end)?;
    let mut r = state.lock().map_err(err)?;
    let projects = r.store.projects().map_err(err)?;
    let rules = r.store.rules().map_err(err)?;
    let raw = r
        .store
        .activities(start.saturating_sub(180_000), end.saturating_add(180_000))
        .map_err(err)?;
    let corrections = r.store.corrections().map_err(err)?;
    let (activities, sessions) =
        pc_session::derive(&raw, &projects, &rules, &corrections, start, end);
    let now = now();
    let mut jobs: Vec<_> = r
        .store
        .jobs()
        .map_err(err)?
        .into_iter()
        .filter(|j| j.start < end && j.end.unwrap_or(now) > start)
        .collect();
    let stats = pc_analytics::summarize(&activities, &mut jobs, start, end, now);
    for job in &mut jobs {
        job.start = job.start.max(start);
        if job.end.is_some() || end < now {
            job.end = Some(job.end.unwrap_or(now).min(end));
        }
    }
    let settings = r.store.settings().map_err(err)?;
    let collector_source = if settings.collector_source != "native"
        && r.aw_last_event.is_some_and(|t| now - t < 10_000)
    {
        "ActivityWatch"
    } else if settings.collector_source == "activitywatch" {
        "ActivityWatch（等待连接）"
    } else {
        "Windows 原生"
    }
    .into();
    r.snapshot_calls += 1;
    Ok(Snapshot {
        collector_source,
        aw_status: r.aw_status.clone(),
        activities,
        sessions,
        jobs,
        stats,
        projects,
        rules,
        settings,
        recording: r.recording,
        breaking: r.breaking,
        intent_id: r.intent.clone(),
        last_sample: r.last_sample,
        current_app: r.current_app.clone(),
        error: r.error.clone(),
        bridge_ready: r.bridge_ready,
        bridge_error: r.bridge_error.clone(),
        browser_connected: r
            .browser
            .as_ref()
            .is_some_and(|b| now - b.received < 40_000),
        database_path: r.path.display().to_string(),
    })
}
#[tauri::command]
pub fn set_recording(state: State<Shared>, recording: bool, breaking: bool) -> Result<(), String> {
    let mut r = state.lock().map_err(err)?;
    r.recording = recording;
    r.breaking = recording && breaking;
    r.generation += 1;
    r.browser = None;
    Ok(())
}
#[tauri::command]
pub fn set_intent(state: State<Shared>, intent_id: Option<String>) -> Result<(), String> {
    let mut r = state.lock().map_err(err)?;
    if let Some(id) = &intent_id {
        if !r.store.projects().map_err(err)?.iter().any(|p| &p.id == id) {
            return Err("项目不存在".into());
        }
    }
    r.intent = intent_id;
    r.generation += 1;
    Ok(())
}
#[tauri::command]
pub fn save_project(state: State<Shared>, mut project: Project) -> Result<(), String> {
    if !valid_text(&project.name, 80)
        || !is_category(&project.category)
        || project.keywords.len() > 30
        || project.keywords.iter().any(|k| k.len() > 200)
        || project.color.len() != 7
        || !project.color.starts_with('#')
        || !project.color[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("请检查项目名称、颜色和关键词".into());
    }
    project.name = project.name.trim().into();
    if project.id.is_empty() {
        project.id = id()
    }
    state
        .lock()
        .map_err(err)?
        .store
        .save_project(&project)
        .map_err(err)
}
#[tauri::command]
pub fn save_rule(state: State<Shared>, mut rule: Rule) -> Result<(), String> {
    if !valid_text(&rule.pattern, 200)
        || !["app", "title", "domain"].contains(&rule.field.as_str())
        || !is_category(&rule.category)
        || !is_relation(&rule.relation)
    {
        return Err("规则无效".into());
    }
    if rule.id.is_empty() {
        rule.id = id()
    }
    state
        .lock()
        .map_err(err)?
        .store
        .save_rule(&rule)
        .map_err(err)
}
#[tauri::command]
pub fn delete_rule(state: State<Shared>, rule_id: String) -> Result<(), String> {
    state
        .lock()
        .map_err(err)?
        .store
        .delete_rule(&rule_id)
        .map_err(err)
}
#[tauri::command]
pub fn correct_activity(state: State<Shared>, correction: Correction) -> Result<(), String> {
    if !is_category(&correction.category) || !is_relation(&correction.relation) {
        return Err("分类无效".into());
    }
    let r = state.lock().map_err(err)?;
    if correction.override_intent {
        if let Some(id) = &correction.intent_id {
            if !r.store.projects().map_err(err)?.iter().any(|p| &p.id == id) {
                return Err("目标不存在".into());
            }
        }
    }
    r.store.correct(&correction).map_err(err)
}
#[tauri::command]
pub fn save_settings(state: State<Shared>, mut settings: Settings) -> Result<(), String> {
    if !["auto", "native", "activitywatch"].contains(&settings.collector_source.as_str())
        || !(1..=5).contains(&settings.sample_seconds)
        || !(30..=900).contains(&settings.idle_seconds)
        || !(7..=365).contains(&settings.retention_days)
        || settings.excluded_apps.len() > 100
        || settings.excluded_titles.len() > 100
    {
        return Err("设置超出允许范围".into());
    }
    let mut r = state.lock().map_err(err)?;
    settings.browser_token = r.store.settings().map_err(err)?.browser_token;
    r.store.save_settings(&settings).map_err(err)?;
    r.generation += 1;
    r.browser = None;
    Ok(())
}
#[tauri::command]
pub fn start_job(
    state: State<Shared>,
    name: String,
    tool: String,
    project_id: Option<String>,
) -> Result<(), String> {
    if !valid_text(&name, 120)
        || !["codex", "claude", "python", "ffmpeg", "npm", "other"].contains(&tool.as_str())
    {
        return Err("请输入任务名称和工具".into());
    }
    let now = now();
    let j = BackgroundJob {
        id: id(),
        tool,
        name,
        project_id,
        start: now,
        end: None,
        last_seen: now,
        status: "running".into(),
        foreground_ms: 0,
        background_ms: 0,
        parallel_ms: 0,
    };
    state.lock().map_err(err)?.store.save_job(&j).map_err(err)
}
#[tauri::command]
pub fn finish_job(state: State<Shared>, job_id: String, status: String) -> Result<(), String> {
    if !["completed", "failed", "stopped"].contains(&status.as_str()) {
        return Err("任务状态无效".into());
    }
    let r = state.lock().map_err(err)?;
    let mut j = r
        .store
        .jobs()
        .map_err(err)?
        .into_iter()
        .find(|j| j.id == job_id && j.status == "running")
        .ok_or("未找到运行中的任务")?;
    j.end = Some(now());
    j.last_seen = now();
    j.status = status;
    r.store.save_job(&j).map_err(err)
}
#[tauri::command]
pub fn toggle_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("widget") {
        if w.is_visible().map_err(err)? {
            w.hide().map_err(err)?
        } else {
            w.show().map_err(err)?
        }
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "widget",
            tauri::WebviewUrl::App("index.html?widget=1".into()),
        )
        .title("PC Insight Mini")
        .inner_size(320.0, 200.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
pub fn show_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(err)?;
        w.set_focus().map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
pub fn autostart_status(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(err)
}
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        app.autolaunch().enable().map_err(err)
    } else {
        app.autolaunch().disable().map_err(err)
    }
}

#[tauri::command]
pub async fn import_activitywatch(
    state: State<'_, Shared>,
    start: Ms,
    end: Ms,
) -> Result<usize, String> {
    period(start, end)?;
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .no_proxy()
            .build()
            .map_err(err)?;
        let base = "http://127.0.0.1:5600/api/0/buckets/";
        let buckets: serde_json::Value = client
            .get(base)
            .send()
            .map_err(|_| "未连接 ActivityWatch，请先启动它的本机服务（5600）".to_string())?
            .error_for_status()
            .map_err(err)?
            .json()
            .map_err(err)?;
        let buckets = buckets.as_object().ok_or("ActivityWatch bucket 格式错误")?;
        let host = std::env::var("COMPUTERNAME").unwrap_or_default();
        let (wid, meta) = buckets
            .iter()
            .find(|(_, m)| {
                m["type"] == "currentwindow"
                    && m["hostname"]
                        .as_str()
                        .is_some_and(|h| h.eq_ignore_ascii_case(&host))
            })
            .ok_or("未找到当前电脑的窗口记录桶")?;
        let (aid, _) = buckets
            .iter()
            .find(|(_, m)| m["type"] == "afkstatus" && m["hostname"] == meta["hostname"])
            .ok_or("未找到同一电脑的 AFK 记录桶，无法保证时间准确")?;
        let start_time = chrono::DateTime::from_timestamp_millis(start)
            .ok_or("日期无效")?
            .to_rfc3339();
        let end_time = chrono::DateTime::from_timestamp_millis(end)
            .ok_or("日期无效")?
            .to_rfc3339();
        let fetch = |bucket: &str| -> Result<Vec<pc_activitywatch::Event>, String> {
            let mut url = reqwest::Url::parse(base).map_err(err)?;
            url.path_segments_mut()
                .map_err(|_| "URL 无效")?
                .pop_if_empty()
                .push(bucket)
                .push("events");
            client
                .get(url)
                .query(&[
                    ("start", &start_time),
                    ("end", &end_time),
                    ("limit", &"-1".to_string()),
                ])
                .send()
                .map_err(err)?
                .error_for_status()
                .map_err(err)?
                .json()
                .map_err(err)
        };
        let events = fetch(wid)?;
        let afk = fetch(aid)?;
        let mut r = shared.lock().map_err(err)?;
        let settings = r.store.settings().map_err(err)?;
        let converted = pc_activitywatch::convert(wid, &events, &afk, start, end, &settings);
        let mut count = 0;
        for (key, activity) in converted {
            if r.store.append(&key, &activity).map_err(err)? {
                count += 1
            }
        }
        Ok(count)
    })
    .await
    .map_err(err)?
}
