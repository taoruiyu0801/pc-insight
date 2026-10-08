use pc_domain::*;

pub fn classify(
    a: Activity,
    projects: &[Project],
    rules: &[Rule],
    corrections: &[Correction],
) -> Classified {
    let mut out = Classified {
        activity: a,
        category: "unknown".into(),
        relation: "unknown".into(),
        state: "unknown".into(),
        confidence: 0.0,
        reason: "尚无足够信息".into(),
    };
    if out.activity.idle {
        out.state = "idle".into();
        out.reason = "超过离开阈值或手动休息".into();
        return out;
    }
    if let Some(c) = corrections
        .iter()
        .find(|c| c.activity_id == out.activity.id)
    {
        if c.override_intent {
            out.activity.intent_id = c.intent_id.clone();
        }
        out.category = c.category.clone();
        out.relation = c.relation.clone();
        out.confidence = 1.0;
        out.reason = "人工纠正".into();
    } else {
        let a = &out.activity;
        let rule = rules
            .iter()
            .rev()
            .filter(|r| r.intent_id.is_none() || r.intent_id == a.intent_id)
            .find(|r| {
                let text = match r.field.as_str() {
                    "app" => &a.process,
                    "title" => &a.title,
                    "domain" => &a.domain,
                    _ => return false,
                };
                !r.pattern.trim().is_empty()
                    && text.to_lowercase().contains(&r.pattern.to_lowercase())
            });
        if let Some(r) = rule {
            out.category = r.category.clone();
            out.relation = r.relation.clone();
            out.confidence = 1.0;
            out.reason = "自定义规则".into();
        } else {
            let text = format!("{} {} {}", a.process, a.title, a.domain).to_lowercase();
            let intent = projects
                .iter()
                .find(|p| Some(&p.id) == a.intent_id.as_ref());
            if let Some(project) = intent.filter(|p| {
                p.keywords
                    .iter()
                    .any(|k| !k.trim().is_empty() && text.contains(&k.to_lowercase()))
            }) {
                out.category = project.category.clone();
                out.relation = "related".into();
                out.confidence = 0.95;
                out.reason = "匹配当前目标关键词".into();
            } else {
                let patterns = [
                    (
                        "entertainment",
                        vec!["bilibili", "steam.exe", "douyin", "netflix"],
                    ),
                    (
                        "communication",
                        vec!["wechat", "weixin", "微信", "discord", "slack"],
                    ),
                    (
                        "coding",
                        vec!["code.exe", "codex", "github.com", "pycharm", "rustrover"],
                    ),
                    (
                        "learning",
                        vec!["netacad", "coursera", "edx.org", "typora", "obsidian"],
                    ),
                    ("research", vec!["arxiv.org", "scholar.google", "zotero"]),
                    ("system", vec!["explorer.exe", "taskmgr", "设置"]),
                ];
                for (category, words) in patterns {
                    if words.iter().any(|w| text.contains(w)) {
                        out.category = category.into();
                        out.confidence = 0.65;
                        out.reason = "应用 / 域名基础分类，相关性未确认".into();
                        break;
                    }
                }
                if let Some(p) = intent {
                    if ["entertainment", "communication"].contains(&out.category.as_str())
                        && p.category != out.category
                    {
                        out.relation = "unrelated".into();
                        out.reason = "与当前目标类别无关，可人工纠正".into();
                    }
                }
            }
        }
    }
    // Without an explicit intent, relevance has no reference point.
    if out.activity.intent_id.is_none() {
        out.relation = "unknown".into();
    }
    out.state = match out.relation.as_str() {
        "related" => "focused",
        "unrelated" => "micro",
        _ => "unknown",
    }
    .into();
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn educational_video_can_be_focused_and_no_intent_is_unknown() {
        let mut a = Activity {
            id: "1".into(),
            source: "native".into(),
            start: 0,
            end: 300_000,
            process: "msedge.exe".into(),
            title: "Cisco tutorial Bilibili".into(),
            domain: "bilibili.com".into(),
            intent_id: Some("cisco".into()),
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        let p = Project {
            id: "cisco".into(),
            name: "Cisco".into(),
            category: "learning".into(),
            color: "#000000".into(),
            keywords: vec!["Cisco".into()],
        };
        assert_eq!(classify(a.clone(), &[p], &[], &[]).state, "focused");
        a.intent_id = None;
        assert_eq!(classify(a, &[], &[], &[]).relation, "unknown");
    }
}
