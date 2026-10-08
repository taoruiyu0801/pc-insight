use pc_domain::*;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct Event {
    pub id: i64,
    pub timestamp: String,
    pub duration: f64,
    pub data: Value,
}

fn span(e: &Event) -> Option<(Ms, Ms)> {
    let s = chrono::DateTime::parse_from_rfc3339(&e.timestamp)
        .ok()?
        .timestamp_millis();
    if !e.duration.is_finite() || e.duration <= 0.0 || e.duration > 31_536_000.0 {
        return None;
    }
    Some((s, s + (e.duration * 1000.0).round() as Ms))
}

pub fn convert(
    bucket: &str,
    events: &[Event],
    afk: &[Event],
    start: Ms,
    end: Ms,
    settings: &Settings,
) -> Vec<(String, Activity)> {
    let mut out = vec![];
    for event in events {
        let Some((s, e)) = span(event) else { continue };
        let s = s.max(start);
        let e = e.min(end);
        if e <= s {
            continue;
        }
        let process = event.data["app"].as_str().unwrap_or("unknown").to_string();
        let title = event.data["title"].as_str().unwrap_or("").to_string();
        let excluded = settings
            .excluded_apps
            .iter()
            .filter(|x| !x.trim().is_empty())
            .any(|x| process.to_lowercase().contains(&x.to_lowercase()))
            || settings
                .excluded_titles
                .iter()
                .filter(|x| !x.trim().is_empty())
                .any(|x| title.to_lowercase().contains(&x.to_lowercase()));
        if excluded {
            continue;
        }
        for status in afk {
            let Some((ss, ee)) = span(status) else {
                continue;
            };
            let ss = s.max(ss);
            let ee = e.min(ee);
            if ee <= ss {
                continue;
            }
            let Some(afk_status) = status.data["status"]
                .as_str()
                .filter(|s| ["afk", "not-afk"].contains(s))
            else {
                continue;
            };
            let key = format!("aw:{bucket}:{}:{ss}:{ee}", event.id);
            out.push((
                key.clone(),
                Activity {
                    id: key,
                    source: "activitywatch".into(),
                    start: ss,
                    end: ee,
                    process: process.clone(),
                    title: if settings.record_titles {
                        title.clone()
                    } else {
                        String::new()
                    },
                    domain: String::new(),
                    intent_id: None,
                    role: "primary".into(),
                    idle: afk_status == "afk",
                    area: 1.0,
                },
            ));
        }
    }
    out
}

pub fn sanitize_domain(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    if !["https", "http"].contains(&url.scheme()) {
        return None;
    }
    url.host_str()
        .map(|h| h.trim_start_matches("www.").to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn secrets_are_not_retained_in_urls() {
        assert_eq!(
            sanitize_domain("https://www.example.com/private?token=secret#name"),
            Some("example.com".into())
        );
        assert_eq!(sanitize_domain("file:///C:/secret.txt"), None);
    }
    #[test]
    fn afk_splits_event_and_missing_afk_is_not_invented() {
        let ev:Vec<Event>=serde_json::from_str(r#"[{"id":1,"timestamp":"2026-10-08T00:00:00Z","duration":60,"data":{"app":"Edge","title":"notes"}}]"#).unwrap();
        let afk:Vec<Event>=serde_json::from_str(r#"[{"id":2,"timestamp":"2026-10-08T00:00:00Z","duration":30,"data":{"status":"not-afk"}},{"id":3,"timestamp":"2026-10-08T00:00:30Z","duration":30,"data":{"status":"afk"}}]"#).unwrap();
        let out = convert("b", &ev, &afk, 0, i64::MAX, &Settings::default());
        assert_eq!(out.len(), 2);
        assert!(!out[0].1.idle);
        assert!(out[1].1.idle);
        assert!(convert("b", &ev, &[], 0, i64::MAX, &Settings::default()).is_empty());
    }
}
