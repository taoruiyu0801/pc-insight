use chrono::{Local, TimeZone};
use pc_domain::*;

pub fn derive(
    input: &[Activity],
    projects: &[Project],
    rules: &[Rule],
    corrections: &[Correction],
    start: Ms,
    end: Ms,
) -> (Vec<Classified>, Vec<Session>) {
    derive_with_review(input, projects, rules, corrections, &[], &[], start, end)
}

/// Range corrections overlay legacy corrections; control events never add time.
pub fn derive_with_review(
    input: &[Activity],
    projects: &[Project],
    rules: &[Rule],
    corrections: &[Correction],
    batches: &[CorrectionBatch],
    controls: &[ControlEvent],
    start: Ms,
    end: Ms,
) -> (Vec<Classified>, Vec<Session>) {
    let mut activities: Vec<Classified> = pc_context::normalize(
        input,
        start.saturating_sub(180_000),
        end.saturating_add(180_000),
    )
    .into_iter()
    .flat_map(|a| {
        let mut edges = vec![a.start, a.end];
        for b in batches.iter().filter(|b| b.undone_at.is_none()) {
            for r in b
                .request
                .ranges
                .iter()
                .filter(|r| r.activity_id == a.id && r.start < a.end && r.end > a.start)
            {
                edges.extend([r.start.max(a.start), r.end.min(a.end)]);
            }
        }
        let mut t = a.start;
        while let Some(date) = Local.timestamp_millis_opt(t).single() {
            let Some(next) = date
                .date_naive()
                .succ_opt()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .and_then(|d| Local.from_local_datetime(&d).earliest())
            else {
                break;
            };
            t = next.timestamp_millis();
            if t >= a.end {
                break;
            }
            edges.push(t);
        }
        edges.sort_unstable();
        edges.dedup();
        edges
            .windows(2)
            .map(|pair| {
                let mut piece = a.clone();
                piece.start = pair[0];
                piece.end = pair[1];
                let mut manual = corrections.iter().find(|c| c.activity_id == a.id).cloned();
                let mut scoped = false;
                for b in batches.iter().filter(|b| {
                    b.undone_at.is_none()
                        && b.request.ranges.iter().any(|r| {
                            r.activity_id == a.id && r.start <= piece.start && r.end >= piece.end
                        })
                }) {
                    scoped = true;
                    let change = &b.request.change;
                    if change.override_intent {
                        piece.intent_id = change.intent_id.clone();
                        if let Some(c) = &mut manual {
                            c.override_intent = true;
                            c.intent_id = change.intent_id.clone();
                        }
                    }
                    if change.category.is_some() || change.relation.is_some() {
                        let base = pc_classifier::classify(
                            piece.clone(),
                            projects,
                            rules,
                            manual.as_ref().map(std::slice::from_ref).unwrap_or(&[]),
                        );
                        let mut c = manual.unwrap_or(Correction {
                            activity_id: a.id.clone(),
                            category: base.category,
                            relation: base.relation,
                            override_intent: false,
                            intent_id: None,
                        });
                        if let Some(v) = &change.category {
                            c.category = v.clone();
                        }
                        if let Some(v) = &change.relation {
                            c.relation = v.clone();
                        }
                        manual = Some(c);
                    }
                }
                let mut classified = pc_classifier::classify(
                    piece,
                    projects,
                    rules,
                    manual.as_ref().map(std::slice::from_ref).unwrap_or(&[]),
                );
                if scoped {
                    classified.reason = format!("人工纠正（所选时段） · {}", classified.reason);
                }
                classified
            })
            .collect::<Vec<_>>()
    })
    .collect();
    let indices: Vec<usize> = activities
        .iter()
        .enumerate()
        .filter(|(_, a)| a.activity.role == "primary")
        .map(|(i, _)| i)
        .collect();
    let mut run: Vec<usize> = vec![];
    let flush = |run: &mut Vec<usize>, activities: &mut Vec<Classified>| {
        let duration: Ms = run.iter().map(|i| activities[*i].activity.duration()).sum();
        let state = if duration >= 180_000 {
            "distracted"
        } else if duration >= 15_000 {
            "interruption"
        } else {
            "micro"
        };
        for i in run.drain(..) {
            activities[i].state = state.into();
        }
    };
    for &i in &indices {
        if let Some(&prev) = run.last() {
            if activities[prev].activity.end != activities[i].activity.start
                || activities[prev].activity.intent_id != activities[i].activity.intent_id
            {
                flush(&mut run, &mut activities);
            }
        }
        if activities[i].relation == "unrelated" {
            run.push(i)
        } else {
            flush(&mut run, &mut activities);
        }
    }
    flush(&mut run, &mut activities);
    activities.retain_mut(|a| {
        a.activity.start = a.activity.start.max(start);
        a.activity.end = a.activity.end.min(end);
        a.activity.end > a.activity.start
    });
    let indices: Vec<_> = activities
        .iter()
        .enumerate()
        .filter(|(_, a)| a.activity.role == "primary")
        .map(|(i, _)| i)
        .collect();
    let mut sessions: Vec<Session> = vec![];
    for i in indices {
        let a = &activities[i];
        if a.activity.idle {
            continue;
        }
        let same = sessions.last().is_some_and(|s| {
            s.intent_id == a.activity.intent_id
                && a.activity.start - s.end <= 300_000
                && Local
                    .timestamp_millis_opt(s.start)
                    .single()
                    .map(|d| d.date_naive())
                    == Local
                        .timestamp_millis_opt(a.activity.start)
                        .single()
                        .map(|d| d.date_naive())
                && !controls
                    .iter()
                    .any(|c| c.kind == "intent" && c.at >= s.end && c.at <= a.activity.start)
        });
        if !same {
            sessions.push(Session {
                id: format!("session:{}:{}", a.activity.id, a.activity.start),
                intent_id: a.activity.intent_id.clone(),
                start: a.activity.start,
                end: a.activity.end,
                active_ms: 0,
                focus_ms: 0,
                activity_ids: vec![],
                interruption_ms: 0,
                distracted_ms: 0,
                unknown_ms: 0,
                members: vec![],
                suggestions: vec![],
            })
        }
        let s = sessions.last_mut().unwrap();
        s.end = a.activity.end;
        s.active_ms += a.activity.duration();
        if a.state == "focused" {
            s.focus_ms += a.activity.duration()
        } else if a.state == "distracted" {
            s.distracted_ms += a.activity.duration();
        } else if ["interruption", "micro"].contains(&a.state.as_str()) {
            s.interruption_ms += a.activity.duration();
        } else {
            s.unknown_ms += a.activity.duration();
        }
        s.activity_ids.push(a.activity.id.clone());
        let member = ActivitySpan {
            activity_id: a.activity.id.clone(),
            start: a.activity.start,
            end: a.activity.end,
        };
        s.members.push(member.clone());
        if a.relation == "unknown"
            && projects
                .iter()
                .any(|p| Some(&p.id) == s.intent_id.as_ref() && p.category == "learning")
        {
            if let Some(tool) = learning_tool(&a.activity) {
                s.suggestions.push(LearningSuggestion {
                    range: member,
                    tool: tool.into(),
                    reason: "学习会话中的通用辅助工具，用途需你确认".into(),
                });
            }
        }
    }
    (activities, sessions)
}

pub fn learning_tool(a: &Activity) -> Option<&'static str> {
    let process = a.process.to_lowercase();
    let domain = a.domain.to_lowercase();
    let title = a.title.to_lowercase();
    let browser = ["msedge.exe", "chrome.exe", "firefox.exe"].contains(&process.as_str());
    if process == "chatgpt.exe"
        || browser
            && (["chatgpt.com", "chat.openai.com"].contains(&domain.as_str())
                || title.contains("chatgpt"))
    {
        Some("ChatGPT")
    } else if process == "goldendict.exe" {
        Some("词典")
    } else if ["typora.exe", "obsidian.exe", "onenote.exe"].contains(&process.as_str()) {
        Some("笔记")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(id: &str, start: Ms, end: Ms, process: &str) -> Activity {
        Activity {
            id: id.into(),
            source: "native".into(),
            start,
            end,
            process: process.into(),
            title: String::new(),
            domain: String::new(),
            intent_id: Some("p".into()),
            role: "primary".into(),
            idle: false,
            area: 1.0,
        }
    }
    #[test]
    fn five_minute_boundary_and_intervening_goal_changes() {
        let a = sample("a", 1_000, 2_000, "Code.exe");
        let b = sample("b", 302_000, 303_000, "Code.exe");
        let (_, sessions) = derive(&[a.clone(), b.clone()], &[], &[], &[], 0, 400_000);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].active_ms, 2_000);
        let mut later = b.clone();
        later.start += 1;
        assert_eq!(
            derive(&[a.clone(), later], &[], &[], &[], 0, 400_000)
                .1
                .len(),
            2
        );
        let controls = vec![
            ControlEvent {
                at: 10_000,
                kind: "intent".into(),
                intent_id: Some("other".into()),
            },
            ControlEvent {
                at: 20_000,
                kind: "intent".into(),
                intent_id: Some("p".into()),
            },
        ];
        assert_eq!(
            derive_with_review(&[a, b], &[], &[], &[], &[], &controls, 0, 400_000)
                .1
                .len(),
            2
        );
    }
    #[test]
    fn midnight_splits_sessions_but_never_adds_time() {
        let midnight = Local
            .with_ymd_and_hms(2026, 10, 8, 0, 0, 0)
            .single()
            .unwrap()
            .timestamp_millis();
        let (_, sessions) = derive(
            &[sample(
                "a",
                midnight - 60_000,
                midnight + 60_000,
                "Code.exe",
            )],
            &[],
            &[],
            &[],
            midnight - 60_000,
            midnight + 60_000,
        );
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions.iter().map(|s| s.active_ms).sum::<i64>(), 120_000);
    }
    #[test]
    fn learning_tools_are_suggestions_not_automatic_focus() {
        let project = Project {
            id: "p".into(),
            name: "Course".into(),
            category: "learning".into(),
            color: String::new(),
            keywords: vec!["course".into()],
        };
        let chat = sample("a", 1_000, 31_000, "ChatGPT.exe");
        let browser = sample("b", 31_000, 61_000, "msedge.exe");
        let (a, s) = derive(&[chat, browser], &[project], &[], &[], 0, 70_000);
        assert!(a.iter().all(|a| a.state == "unknown"));
        assert_eq!(s[0].suggestions.len(), 1);
        assert_eq!(s[0].focus_ms, 0);
    }
    #[test]
    fn midnight_does_not_hide_an_existing_distraction() {
        let a = Activity {
            id: "cross-midnight".into(),
            source: "native".into(),
            start: -120_000,
            end: 120_000,
            process: "steam.exe".into(),
            title: String::new(),
            domain: String::new(),
            intent_id: Some("p".into()),
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        let p = Project {
            id: "p".into(),
            name: "study".into(),
            category: "learning".into(),
            color: String::new(),
            keywords: vec![],
        };
        let (activities, _) = derive(&[a], &[p], &[], &[], 0, 86_400_000);
        assert_eq!(activities[0].state, "distracted");
        assert_eq!(activities[0].activity.duration(), 120_000);
    }
    #[test]
    fn sustained_distraction_spans_multiple_windows() {
        let mut a = Activity {
            id: "1".into(),
            source: "native".into(),
            start: 0,
            end: 100_000,
            process: "wechat.exe".into(),
            title: "chat".into(),
            domain: "".into(),
            intent_id: Some("p".into()),
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        let p = Project {
            id: "p".into(),
            name: "P".into(),
            category: "learning".into(),
            color: "".into(),
            keywords: vec![],
        };
        let mut b = a.clone();
        b.id = "2".into();
        b.start = 100_000;
        b.end = 200_000;
        b.process = "steam.exe".into();
        let (out, s) = derive(&[a.clone(), b], &[p], &[], &[], 0, 200_000);
        assert!(out.iter().all(|a| a.state == "distracted"));
        assert_eq!(s.len(), 1);
        a.end = 5_000;
        let c = Correction {
            activity_id: "1".into(),
            category: "learning".into(),
            relation: "unrelated".into(),
            override_intent: false,
            intent_id: None,
        };
        assert_eq!(derive(&[a], &[], &[], &[c], 0, 10_000).0[0].state, "micro");
    }
}
