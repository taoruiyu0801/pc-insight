use pc_domain::{Activity, Ms};

pub fn union(mut intervals: Vec<(Ms, Ms)>) -> Vec<(Ms, Ms)> {
    intervals.retain(|(s, e)| e > s);
    intervals.sort_unstable();
    let mut out: Vec<(Ms, Ms)> = Vec::new();
    for (s, e) in intervals {
        if let Some(last) = out.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        out.push((s, e));
    }
    out
}

pub fn measure(intervals: Vec<(Ms, Ms)>) -> Ms {
    union(intervals).iter().map(|(s, e)| e - s).sum()
}

pub fn intersection(a: &[(Ms, Ms)], b: &[(Ms, Ms)]) -> Vec<(Ms, Ms)> {
    let mut out = vec![];
    for (sa, ea) in a {
        for (sb, eb) in b {
            let s = (*sa).max(*sb);
            let e = (*ea).min(*eb);
            if e > s {
                out.push((s, e));
            }
        }
    }
    union(out)
}

/// Imported and native primary records share one wall clock. Native wins overlap.
pub fn normalize(input: &[Activity], start: Ms, end: Ms) -> Vec<Activity> {
    use std::collections::{BTreeMap, BTreeSet};
    let clipped: Vec<Activity> = input
        .iter()
        .filter_map(|a| {
            let mut a = a.clone();
            a.start = a.start.max(start);
            a.end = a.end.min(end);
            (a.end > a.start).then_some(a)
        })
        .collect();
    let mut edges: BTreeMap<Ms, (Vec<usize>, Vec<usize>)> = BTreeMap::new();
    let mut result = vec![];
    for (i, a) in clipped.iter().enumerate() {
        if a.role != "primary" {
            result.push(a.clone());
            continue;
        }
        edges.entry(a.start).or_default().0.push(i);
        edges.entry(a.end).or_default().1.push(i);
    }
    let mut active: BTreeSet<(u8, usize)> = BTreeSet::new();
    let mut previous = start;
    let priority = |i: usize| (u8::from(clipped[i].source == "native"), i);
    let mut primary: Vec<Activity> = vec![];
    for (time, (adds, removes)) in edges {
        if time > previous {
            if let Some((_, i)) = active.last() {
                let mut a = clipped[*i].clone();
                a.start = previous;
                a.end = time;
                if let Some(last) = primary.last_mut() {
                    if last.id == a.id && last.end == a.start {
                        last.end = a.end;
                    } else {
                        primary.push(a);
                    }
                } else {
                    primary.push(a);
                }
            }
        }
        for i in removes {
            active.remove(&priority(i));
        }
        for i in adds {
            active.insert(priority(i));
        }
        previous = time;
    }
    result.extend(primary);
    result.sort_by_key(|a| (a.start, a.role.clone()));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn overlapping_time_is_not_added_twice() {
        assert_eq!(measure(vec![(0, 60), (20, 80), (80, 100)]), 100);
        assert_eq!(intersection(&[(0, 50)], &[(20, 60)]), vec![(20, 50)]);
    }
    #[test]
    fn native_takes_priority_without_losing_imported_edges() {
        let a = Activity {
            id: "aw".into(),
            source: "activitywatch".into(),
            start: 0,
            end: 100,
            process: "x".into(),
            title: "".into(),
            domain: "".into(),
            intent_id: None,
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        let mut b = a.clone();
        b.id = "native".into();
        b.source = "native".into();
        b.start = 20;
        b.end = 60;
        let out = normalize(&[a, b], 0, 100);
        assert_eq!(out.iter().map(Activity::duration).sum::<i64>(), 100);
        assert_eq!(out[1].id, "native");
    }
    #[test]
    fn normalized_primary_is_disjoint_and_conserves_coverage() {
        let input: Vec<_> = (0..250)
            .map(|i| Activity {
                id: i.to_string(),
                source: if i % 3 == 0 {
                    "native"
                } else {
                    "activitywatch"
                }
                .into(),
                start: (i * 7919) % 100_000,
                end: (i * 7919) % 100_000 + 5000,
                process: "app".into(),
                title: String::new(),
                domain: String::new(),
                intent_id: None,
                role: "primary".into(),
                idle: false,
                area: 1.0,
            })
            .collect();
        let out = normalize(&input, 0, 100_000);
        for pair in out.windows(2) {
            assert!(pair[0].end <= pair[1].start)
        }
        assert_eq!(
            out.iter().map(Activity::duration).sum::<Ms>(),
            measure(
                input
                    .iter()
                    .map(|a| (a.start, a.end.min(100_000)))
                    .collect()
            )
        );
    }
}
