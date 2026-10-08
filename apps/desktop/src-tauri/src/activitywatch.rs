use crate::{runtime::now, Shared};
use pc_activitywatch::Event;
use pc_domain::*;
use std::time::Duration;

pub fn fetch(start: Ms, end: Ms) -> Result<(String, Vec<Event>, Vec<Event>), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;
    let base = "http://127.0.0.1:5600/api/0/buckets/";
    let buckets: serde_json::Value = client
        .get(base)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| "未检测到本机 ActivityWatch 服务".to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let buckets = buckets.as_object().ok_or("记录桶格式错误")?;
    let host = std::env::var("COMPUTERNAME").unwrap_or_default();
    let (wid, meta) = buckets
        .iter()
        .find(|(_, m)| {
            m["type"] == "currentwindow"
                && m["hostname"]
                    .as_str()
                    .is_some_and(|h| h.eq_ignore_ascii_case(&host))
        })
        .ok_or("没有当前电脑的窗口记录")?;
    let (aid, _) = buckets
        .iter()
        .find(|(_, m)| m["type"] == "afkstatus" && m["hostname"] == meta["hostname"])
        .ok_or("没有配套 AFK 记录")?;
    // AW queries need to include the current long-running heartbeat; server returns
    // events overlapping start/end. No last-day history is assigned today's intent.
    let s = chrono::DateTime::from_timestamp_millis(start)
        .ok_or("日期无效")?
        .to_rfc3339();
    let e = chrono::DateTime::from_timestamp_millis(end)
        .ok_or("日期无效")?
        .to_rfc3339();
    let get = |bucket: &str| -> Result<Vec<Event>, String> {
        let mut url = reqwest::Url::parse(base).map_err(|e| e.to_string())?;
        url.path_segments_mut()
            .map_err(|_| "URL 错误")?
            .pop_if_empty()
            .push(bucket)
            .push("events");
        client
            .get(url)
            .query(&[("start", s.as_str()), ("end", e.as_str()), ("limit", "-1")])
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json()
            .map_err(|e| e.to_string())
    };
    Ok((wid.clone(), get(wid)?, get(aid)?))
}

pub fn start(shared: Shared) {
    std::thread::spawn(move || {
        let mut generation = u64::MAX;
        let mut since = now();
        let mut cursor = since;
        loop {
            std::thread::sleep(Duration::from_secs(4));
            let (current, intent, settings) = match shared.lock() {
                Ok(r) => {
                    let settings = match r.store.settings() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    if !r.recording || r.breaking || settings.collector_source == "native" {
                        generation = u64::MAX;
                        continue;
                    }
                    (r.generation, r.intent.clone(), settings)
                }
                Err(_) => continue,
            };
            let end = now();
            if generation != current {
                generation = current;
                since = end;
                cursor = end;
                continue;
            }
            // On sleep/resume only fetch a fresh window, never infer work across sleep.
            if end - cursor > 15_000 {
                since = end;
                cursor = end;
                continue;
            }
            let start = (cursor - 8_000).max(since);
            let result = fetch(start, end);
            if let Ok(mut r) = shared.lock() {
                if !r.recording || r.breaking || r.generation != generation {
                    continue;
                }
                match result {
                    Ok((bucket, events, afk)) => {
                        let items = pc_activitywatch::convert(
                            &bucket, &events, &afk, start, end, &settings,
                        );
                        let newest = items.iter().map(|(_, a)| a.end).max();
                        r.aw_last_event = newest;
                        r.aw_status = if newest.is_some_and(|t| end - t < 10_000) {
                            "已连接窗口与 AFK watcher"
                        } else {
                            "服务已连接，等待 watcher 新记录"
                        }
                        .into();
                        for (key, mut a) in items {
                            a.id = format!("live:{generation}:{key}");
                            a.intent_id = intent.clone();
                            if let Some(b) = r.browser.as_ref().filter(|b| {
                                end - b.received < 40_000
                                    && a.process.to_lowercase() == b.browser
                                    && !b.title.is_empty()
                                    && a.title.contains(&b.title)
                                    && a.end > b.received - 40_000
                            }) {
                                a.domain = b.domain.clone();
                            }
                            if let Err(e) = r.store.append(&format!("live:{generation}:{key}"), &a)
                            {
                                r.error = Some(e.to_string());
                            }
                        }
                    }
                    Err(error) => {
                        r.aw_last_event = None;
                        r.aw_status = error;
                    }
                }
            }
            cursor = end;
        }
    });
}
