use pc_context::{intersection, measure, union};
use pc_domain::*;

pub fn summarize(
    activities: &[Classified],
    jobs: &mut [BackgroundJob],
    start: Ms,
    end: Ms,
    now: Ms,
) -> Stats {
    let mut stats = Stats::default();
    let primary: Vec<_> = activities
        .iter()
        .filter(|a| a.activity.role == "primary")
        .collect();
    let mut focused = vec![];
    let mut active = vec![];
    let mut unrelated = vec![];
    let mut distracted = vec![];
    let mut previous: Option<&Classified> = None;
    for a in &primary {
        let d = a.activity.duration();
        let span = (a.activity.start, a.activity.end);
        if a.activity.idle {
            stats.idle_ms += d;
            previous = None;
            continue;
        }
        active.push(span);
        stats.active_ms += d;
        *stats.category_ms.entry(a.category.clone()).or_default() += d;
        if let Some(id) = &a.activity.intent_id {
            *stats.project_ms.entry(id.clone()).or_default() += d;
        }
        match a.state.as_str() {
            "focused" => {
                stats.focus_ms += d;
                focused.push(span)
            }
            "distracted" => {
                stats.distracted_ms += d;
                distracted.push(span)
            }
            "interruption" | "micro" => stats.interruption_ms += d,
            _ => stats.unknown_ms += d,
        }
        if a.relation == "unrelated" {
            unrelated.push(span)
        }
        if let Some(prev) = previous {
            if prev.activity.end == a.activity.start
                && (prev.activity.process != a.activity.process
                    || prev.activity.title != a.activity.title)
            {
                stats.switches += 1
            }
        }
        previous = Some(a);
    }
    for (s, e) in union(focused) {
        stats.longest_focus_ms = stats.longest_focus_ms.max(e - s);
        if e - s >= 1_500_000 {
            stats.deep_ms += e - s
        }
    }
    stats.distraction_count = union(distracted).len() as u32;
    if stats.active_ms > 0 {
        stats.fragmentation = union(unrelated).len() as f64 / (stats.active_ms as f64 / 3_600_000.0)
    }
    let mut job_spans = vec![];
    let mut parallel_spans = vec![];
    for job in jobs {
        let span = (
            job.start.max(start),
            job.end
                .unwrap_or(now.min(job.last_seen + 5_000))
                .min(end)
                .min(now),
        );
        if span.1 <= span.0 {
            continue;
        }
        job_spans.push(span);
        let tool = job.tool.to_lowercase();
        let interactions: Vec<_> = primary
            .iter()
            .filter(|a| !a.activity.idle && a.activity.process.to_lowercase().contains(&tool))
            .map(|a| (a.activity.start, a.activity.end))
            .collect();
        let others: Vec<_> = primary
            .iter()
            .filter(|a| !a.activity.idle && !a.activity.process.to_lowercase().contains(&tool))
            .map(|a| (a.activity.start, a.activity.end))
            .collect();
        job.foreground_ms = measure(intersection(&[span], &interactions));
        job.background_ms = (span.1 - span.0 - job.foreground_ms).max(0);
        let overlap = intersection(&[span], &others);
        job.parallel_ms = measure(overlap.clone());
        parallel_spans.extend(overlap);
    }
    stats.background_ms = measure(job_spans);
    stats.parallel_ms = measure(parallel_spans);
    stats
}

#[cfg(test)]
mod tests {
    use super::*;
    fn activity(role: &str, state: &str, start: Ms, end: Ms) -> Classified {
        Classified {
            activity: Activity {
                id: role.into(),
                source: "native".into(),
                start,
                end,
                process: "typora.exe".into(),
                title: "notes".into(),
                domain: "".into(),
                intent_id: Some("p".into()),
                role: role.into(),
                idle: false,
                area: 0.5,
            },
            category: "learning".into(),
            relation: "related".into(),
            state: state.into(),
            confidence: 1.0,
            reason: "test".into(),
        }
    }
    #[test]
    fn supporting_and_multiple_jobs_never_double_human_time() {
        let mut jobs: Vec<_> = (0..2)
            .map(|n| BackgroundJob {
                id: n.to_string(),
                tool: "codex".into(),
                name: "work".into(),
                project_id: None,
                start: 0,
                end: Some(3_600_000),
                last_seen: 3_600_000,
                status: "completed".into(),
                foreground_ms: 0,
                background_ms: 0,
                parallel_ms: 0,
            })
            .collect();
        let s = summarize(
            &[
                activity("primary", "focused", 0, 3_600_000),
                activity("supporting", "focused", 0, 3_600_000),
            ],
            &mut jobs,
            0,
            3_600_000,
            3_600_000,
        );
        assert_eq!(s.active_ms, 3_600_000);
        assert_eq!(s.background_ms, 3_600_000);
        assert_eq!(s.parallel_ms, 3_600_000);
        assert_eq!(s.deep_ms, 3_600_000);
    }
    #[test]
    fn unknown_gap_interrupts_deep_work() {
        let s = summarize(
            &[
                activity("primary", "focused", 0, 900_000),
                activity("primary", "unknown", 900_000, 960_000),
                activity("primary", "focused", 960_000, 1_860_000),
            ],
            &mut [],
            0,
            2_000_000,
            2_000_000,
        );
        assert_eq!(s.deep_ms, 0);
        assert_eq!(s.longest_focus_ms, 900_000);
    }
}
