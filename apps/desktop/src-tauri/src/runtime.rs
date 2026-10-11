use crate::Shared;
use pc_database::Store;
use pc_domain::*;
use std::{path::PathBuf, thread, time::Duration};
use uuid::Uuid;

#[derive(Clone)]
pub struct BrowserSnapshot {
    pub domain: String,
    pub title: String,
    pub browser: String,
    pub received: Ms,
}

pub struct Runtime {
    pub snapshot_calls: u64,
    pub aw_last_event: Option<Ms>,
    pub aw_status: String,
    pub store: Store,
    pub path: PathBuf,
    pub recording: bool,
    pub breaking: bool,
    pub intent: Option<String>,
    pub generation: u64,
    pub last_sample: Option<Ms>,
    pub error: Option<String>,
    pub bridge_error: Option<String>,
    pub bridge_ready: bool,
    pub browser: Option<BrowserSnapshot>,
    pub current_app: Option<String>,
}
pub fn now() -> Ms {
    chrono::Utc::now().timestamp_millis()
}
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
pub fn sample_end(start: Ms, end: Ms, seconds: u64) -> Ms {
    if end - start > 10_000 {
        start + seconds as i64 * 1000
    } else {
        end
    }
}
impl Runtime {
    pub fn new(path: PathBuf) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let store = Store::open(&path)?;
        let mut settings = store.settings()?;
        if settings.browser_token.is_empty() {
            settings.browser_token = format!("{}{}", id(), id());
            store.save_settings(&settings)?;
        }
        store.recover_jobs()?;
        store.prune(now() - settings.retention_days as i64 * 86_400_000)?;
        let remembered = store.last_intent()?;
        let intent = remembered.filter(|id| {
            store
                .projects()
                .is_ok_and(|ps| ps.iter().any(|p| &p.id == id))
        });
        Ok(Self {
            snapshot_calls: 0,
            aw_last_event: None,
            aw_status: "等待开始记录后连接".into(),
            store,
            path,
            recording: false,
            breaking: false,
            intent,
            generation: 0,
            last_sample: None,
            error: None,
            bridge_error: None,
            bridge_ready: false,
            browser: None,
            current_app: None,
        })
    }

    pub fn set_recording(
        &mut self,
        recording: bool,
        breaking: bool,
        allow_unassigned: bool,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        if recording && !self.recording && self.intent.is_none() && !allow_unassigned {
            return Ok(false);
        }
        let breaking = recording && breaking;
        if self.recording == recording && self.breaking == breaking {
            return Ok(true);
        }
        self.store.control(
            &ControlEvent {
                at: now(),
                kind: if !recording {
                    "pause"
                } else if breaking {
                    "break"
                } else {
                    "start"
                }
                .into(),
                intent_id: self.intent.clone(),
            },
            false,
        )?;
        self.recording = recording;
        self.breaking = breaking;
        self.generation += 1;
        self.browser = None;
        Ok(true)
    }

    pub fn set_intent(
        &mut self,
        intent: Option<String>,
        allow_unassigned: bool,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        if intent.as_ref().is_some_and(|id| {
            !self
                .store
                .projects()
                .is_ok_and(|ps| ps.iter().any(|p| &p.id == id))
        }) {
            return Err("项目不存在".into());
        }
        if self.recording && intent.is_none() && !allow_unassigned {
            return Ok(false);
        }
        if self.intent == intent {
            return Ok(true);
        }
        self.store.control(
            &ControlEvent {
                at: now(),
                kind: "intent".into(),
                intent_id: intent.clone(),
            },
            true,
        )?;
        self.intent = intent;
        self.generation += 1;
        Ok(true)
    }
}

pub fn start(state: Shared) {
    thread::spawn(move || {
        let mut pending: Option<(u64, Vec<Activity>)> = None;
        let mut last_prune = now();
        loop {
            let delay = if let Ok(mut r) = state.lock() {
                let now = now();
                let settings = match r.store.settings() {
                    Ok(s) => s,
                    Err(e) => {
                        r.error = Some(e.to_string());
                        thread::sleep(Duration::from_secs(2));
                        continue;
                    }
                };
                if let Err(e) = r.store.heartbeat_jobs(now) {
                    r.error = Some(e.to_string());
                }
                if now - last_prune > 3_600_000 {
                    if let Err(e) = r
                        .store
                        .prune(now - settings.retention_days as i64 * 86_400_000)
                    {
                        r.error = Some(e.to_string());
                    }
                    last_prune = now;
                }
                if !r.recording {
                    pending = None;
                    r.current_app = None;
                } else {
                    if let Some((generation, items)) = pending.take() {
                        if generation == r.generation {
                            for mut a in items {
                                a.end = sample_end(a.start, now, settings.sample_seconds);
                                if let Err(e) = r.store.append(&format!("native:{}", a.id), &a) {
                                    r.error = Some(e.to_string());
                                }
                            }
                        }
                    }
                    if r.breaking {
                        pending = Some((
                            r.generation,
                            vec![Activity {
                                id: id(),
                                source: "native".into(),
                                start: now,
                                end: now,
                                process: "休息".into(),
                                title: String::new(),
                                domain: String::new(),
                                intent_id: r.intent.clone(),
                                role: "primary".into(),
                                idle: true,
                                area: 1.0,
                            }],
                        ));
                        r.current_app = Some("休息中".into());
                        r.last_sample = Some(now);
                    } else {
                        match pc_collector::sample() {
                            Ok(sample) => {
                                r.error = None;
                                r.last_sample = Some(now);
                                let primary = sample.windows.iter().find(|w| w.foreground);
                                if primary.is_some_and(|w| pc_collector::excluded(w, &settings)) {
                                    r.current_app = Some("已排除的窗口".into());
                                } else {
                                    r.current_app = primary.map(|w| w.process.clone());
                                    let mut items = vec![];
                                    for w in sample
                                        .windows
                                        .iter()
                                        .filter(|w| !pc_collector::excluded(w, &settings))
                                    {
                                        let aw_live =
                                            r.aw_last_event.is_some_and(|t| now - t < 10_000);
                                        if w.foreground
                                            && (settings.collector_source == "activitywatch"
                                                || settings.collector_source == "auto" && aw_live)
                                        {
                                            continue;
                                        }
                                        let domain = r
                                            .browser
                                            .as_ref()
                                            .filter(|b| {
                                                now - b.received < 40_000
                                                    && w.foreground
                                                    && w.process.to_lowercase() == b.browser
                                                    && !b.title.is_empty()
                                                    && w.title.contains(&b.title)
                                            })
                                            .map(|b| b.domain.clone())
                                            .unwrap_or_default();
                                        items.push(Activity {
                                            id: id(),
                                            source: "native".into(),
                                            start: now,
                                            end: now,
                                            process: w.process.clone(),
                                            title: if settings.record_titles {
                                                w.title.clone()
                                            } else {
                                                String::new()
                                            },
                                            domain,
                                            intent_id: r.intent.clone(),
                                            role: if w.foreground {
                                                "primary"
                                            } else {
                                                "supporting"
                                            }
                                            .into(),
                                            idle: sample.idle_ms >= settings.idle_seconds * 1000,
                                            area: w.area,
                                        });
                                    }
                                    pending = Some((r.generation, items));
                                }
                            }
                            Err(e) => {
                                r.error = Some(e);
                                pending = None;
                                r.current_app = None;
                            }
                        }
                    }
                }
                settings.sample_seconds
            } else {
                2
            };
            thread::sleep(Duration::from_secs(delay));
        }
    });
}

pub fn smoke_test() {
    let result = (|| -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let mut db = Store::memory()?;
        let sample = pc_collector::sample().map_err(std::io::Error::other)?;
        let windows = sample.windows.len();
        let foreground = sample.windows.iter().filter(|w| w.foreground).count();
        let now = now();
        // Only synthetic titles in this diagnostic; never writes real captured metadata.
        let a = Activity {
            id: id(),
            source: "native".into(),
            start: now - 2000,
            end: now,
            process: "smoke.exe".into(),
            title: "synthetic".into(),
            domain: String::new(),
            intent_id: None,
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        db.append("smoke", &a)?;
        let raw = db.activities(now - 3000, now)?;
        let (activities, sessions) = pc_session::derive(&raw, &[], &[], &[], now - 3000, now);
        let stats = pc_analytics::summarize(&activities, &mut [], now - 3000, now, now);
        assert_eq!(stats.active_ms, 2000);
        assert_eq!(foreground, 1);
        let mut result = serde_json::json!({"success":true,"visibleWindows":windows,"foregroundWindows":foreground,"database":"in-memory","activeMs":stats.active_ms,"sessions":sessions.len()});
        if std::env::args().any(|a| a == "--smoke-aw") {
            let (bucket, events, afk) =
                crate::activitywatch::fetch(now - 120_000, now).map_err(std::io::Error::other)?;
            let items = pc_activitywatch::convert(
                &bucket,
                &events,
                &afk,
                now - 120_000,
                now,
                &Settings::default(),
            );
            if items.is_empty() {
                return Err(std::io::Error::other(
                    "AW connected but no overlapping window/AFK samples",
                )
                .into());
            }
            let mut aw_db = Store::memory()?;
            for (key, a) in &items {
                aw_db.append(key, a)?;
            }
            for (key, a) in &items {
                assert!(!aw_db.append(key, a)?);
            }
            let raw = aw_db.activities(now - 120_000, now)?;
            let (activities, _) = pc_session::derive(&raw, &[], &[], &[], now - 120_000, now);
            let stats = pc_analytics::summarize(&activities, &mut [], now - 120_000, now, now);
            assert!(stats.active_ms + stats.idle_ms > 0);
            result["activityWatch"] = serde_json::json!({"realHttp":true,"windowEvents":events.len(),"afkEvents":afk.len(),"convertedIntervals":items.len(),"activeMs":stats.active_ms,"idleMs":stats.idle_ms,"duplicateImport":"idempotent"});
        }
        Ok(result)
    })();
    let root = std::env::current_dir().unwrap();
    let out = root.join("artifacts");
    let _ = std::fs::create_dir_all(&out);
    let result = match result {
        Ok(v) => v,
        Err(e) => serde_json::json!({"success":false,"error":e.to_string()}),
    };
    let _ = std::fs::write(
        out.join("native-smoke.json"),
        serde_json::to_string_pretty(&result).unwrap(),
    );
    if result["success"] != true {
        std::process::exit(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remembered_goal_survives_restart_without_starting_recording() {
        let path = std::env::temp_dir().join(format!("pc-insight-runtime-test-{}.db", id()));
        {
            let mut r = Runtime::new(path.clone()).unwrap();
            assert!(!r.set_recording(true, false, false).unwrap());
            assert!(!r.recording);
            assert!(r.set_recording(true, false, true).unwrap());
            r.set_recording(false, false, false).unwrap();
            assert!(!r.set_recording(true, false, false).unwrap());
            r.store
                .save_project(&Project {
                    id: "p".into(),
                    name: "Synthetic".into(),
                    category: "learning".into(),
                    color: "#000000".into(),
                    keywords: vec![],
                })
                .unwrap();
            r.set_intent(Some("p".into()), false).unwrap();
            assert!(r.set_recording(true, false, false).unwrap());
            assert!(!r.set_intent(None, false).unwrap());
            assert_eq!(r.intent, Some("p".into()));
        }
        {
            let mut r = Runtime::new(path.clone()).unwrap();
            assert_eq!(r.intent, Some("p".into()));
            assert!(!r.recording);
            assert!(!r.breaking);
            r.store
                .conn
                .execute("DELETE FROM projects WHERE id='p'", [])
                .unwrap();
            r.set_recording(false, false, false).unwrap();
        }
        {
            let r = Runtime::new(path.clone()).unwrap();
            assert!(r.intent.is_none());
            assert!(!r.recording);
        }
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn sleep_is_not_counted_as_hours_of_work() {
        assert_eq!(sample_end(0, 3_600_000, 2), 2_000);
        assert_eq!(sample_end(0, 2100, 2), 2100);
    }
}
