use pc_domain::*;

pub fn derive(
    input: &[Activity],
    projects: &[Project],
    rules: &[Rule],
    corrections: &[Correction],
    start: Ms,
    end: Ms,
) -> (Vec<Classified>, Vec<Session>) {
    let mut activities: Vec<Classified> = pc_context::normalize(
        input,
        start.saturating_sub(180_000),
        end.saturating_add(180_000),
    )
    .into_iter()
    .map(|a| pc_classifier::classify(a, projects, rules, corrections))
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
            s.intent_id == a.activity.intent_id && a.activity.start - s.end < 300_000
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
            })
        }
        let s = sessions.last_mut().unwrap();
        s.end = a.activity.end;
        s.active_ms += a.activity.duration();
        if a.state == "focused" {
            s.focus_ms += a.activity.duration()
        }
        s.activity_ids.push(a.activity.id.clone());
    }
    (activities, sessions)
}

#[cfg(test)]
mod tests {
    use super::*;
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
