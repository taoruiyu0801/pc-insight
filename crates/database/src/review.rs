use super::*;
use std::hash::{Hash, Hasher};
#[cfg(test)]
#[path = "review_tests.rs"]
mod tests;

fn totals(items: &[Classified]) -> CorrectionTotals {
    let mut out = CorrectionTotals::default();
    for a in items {
        let d = a.activity.duration();
        out.active_ms += d;
        match a.state.as_str() {
            "focused" => out.focus_ms += d,
            "micro" | "interruption" => out.interruption_ms += d,
            "distracted" => out.distracted_ms += d,
            _ => out.unknown_ms += d,
        }
    }
    out
}

fn selected(items: &[Classified], ranges: &[ActivitySpan]) -> Vec<Classified> {
    let mut out = vec![];
    for a in items
        .iter()
        .filter(|a| a.activity.role == "primary" && !a.activity.idle)
    {
        for r in ranges.iter().filter(|r| r.activity_id == a.activity.id) {
            let mut piece = a.clone();
            piece.activity.start = piece.activity.start.max(r.start);
            piece.activity.end = piece.activity.end.min(r.end);
            if piece.activity.end > piece.activity.start {
                out.push(piece);
            }
        }
    }
    out
}

impl Store {
    pub fn preview_correction(&self, request: &CorrectionRequest) -> Result<CorrectionPreview> {
        let change = &request.change;
        if request.ranges.is_empty()
            || request.ranges.len() > 10_000
            || change.category.as_ref().is_some_and(|c| !is_category(c))
            || change.relation.as_ref().is_some_and(|r| !is_relation(r))
            || (!change.override_intent && change.category.is_none() && change.relation.is_none())
        {
            return Err("请选择有效记录和纠正内容".into());
        }
        let projects = self.projects()?;
        if change.override_intent
            && change
                .intent_id
                .as_ref()
                .is_some_and(|id| !projects.iter().any(|p| &p.id == id))
        {
            return Err("目标不存在，请重新选择".into());
        }
        let mut ordered = request.ranges.clone();
        ordered.sort_by(|a, b| {
            (&a.activity_id, a.start, a.end).cmp(&(&b.activity_id, b.start, b.end))
        });
        let mut ranges: Vec<ActivitySpan> = vec![];
        for r in ordered {
            if r.start < 0 || r.end <= r.start {
                return Err("时间范围无效".into());
            }
            if let Some(prev) = ranges.last_mut() {
                if prev.activity_id == r.activity_id && r.start <= prev.end {
                    prev.end = prev.end.max(r.end);
                    continue;
                }
            }
            ranges.push(r);
        }
        let start = ranges.iter().map(|r| r.start).min().unwrap();
        let end = ranges.iter().map(|r| r.end).max().unwrap();
        if end - start > 32 * 86_400_000 {
            return Err("纠正范围不能超过 32 天".into());
        }
        let raw = self.activities(start.saturating_sub(180_000), end.saturating_add(180_000))?;
        let rules = self.rules()?;
        let legacy = self.corrections()?;
        let mut batches = self.batches()?;
        let controls = self.controls(start, end)?;
        let (before, _) = pc_session::derive_with_review(
            &raw, &projects, &rules, &legacy, &batches, &controls, start, end,
        );
        let before = selected(&before, &ranges);
        let requested_ms: i64 = ranges.iter().map(|r| r.end - r.start).sum();
        if before.iter().map(|a| a.activity.duration()).sum::<i64>() != requested_ms {
            return Err("所选记录已改变，或包含离开/辅助/被其他来源覆盖的区间，请重新选择".into());
        }
        let overlaps = |rs: &[ActivitySpan]| {
            rs.iter().any(|a| {
                ranges
                    .iter()
                    .any(|b| a.activity_id == b.activity_id && a.start < b.end && a.end > b.start)
            })
        };
        let relevant_batches: Vec<_> = batches
            .iter()
            .filter(|b| overlaps(&b.request.ranges))
            .collect();
        let relevant_legacy: Vec<_> = legacy
            .iter()
            .filter(|c| ranges.iter().any(|r| r.activity_id == c.activity_id))
            .collect();
        // Content signature detects changes to this selection, without expiring
        // merely because the collector appended unrelated activity elsewhere.
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        to_string(&(&ranges, change, &before, relevant_batches, relevant_legacy))?
            .hash(&mut hasher);
        let token = format!("{:016x}", hasher.finish());
        let stub = CorrectionPreview {
            token: token.clone(),
            ranges: ranges.clone(),
            before: totals(&before),
            after: CorrectionTotals::default(),
            overwritten_manual_count: before
                .iter()
                .filter(|a| a.reason.starts_with("人工纠正"))
                .count(),
        };
        batches.push(CorrectionBatch {
            id: "preview".into(),
            created_at: 0,
            undone_at: None,
            label: String::new(),
            request: CorrectionRequest {
                ranges: ranges.clone(),
                change: change.clone(),
            },
            preview: stub.clone(),
        });
        let (after, _) = pc_session::derive_with_review(
            &raw, &projects, &rules, &legacy, &batches, &controls, start, end,
        );
        Ok(CorrectionPreview {
            after: totals(&selected(&after, &ranges)),
            ..stub
        })
    }

    pub fn commit_correction(
        &self,
        id: &str,
        request: &CorrectionRequest,
        token: &str,
        label: &str,
        now: Ms,
    ) -> Result<CorrectionBatch> {
        if id.is_empty() || id.len() > 100 || label.chars().count() > 120 {
            return Err("纠正批次参数无效".into());
        }
        let tx = self.conn.unchecked_transaction()?;
        if let Some(old) = self.batches()?.into_iter().find(|b| b.id == id) {
            if to_string(&old.request)? != to_string(request)? || old.preview.token != token {
                return Err("批次编号已用于另一操作".into());
            }
            tx.commit()?;
            return Ok(old);
        }
        let preview = self.preview_correction(request)?;
        if preview.token != token {
            return Err("所选记录或人工判断已更新，请重新预览".into());
        }
        let batch = CorrectionBatch {
            id: id.into(),
            created_at: now,
            undone_at: None,
            label: label.into(),
            request: CorrectionRequest {
                ranges: preview.ranges.clone(),
                change: request.change.clone(),
            },
            preview,
        };
        tx.execute(
            "INSERT INTO correction_batches(id,payload) VALUES(?1,?2)",
            params![id, to_string(&batch)?],
        )?;
        tx.commit()?;
        Ok(batch)
    }

    pub fn undo_correction(&self, id: &str, now: Ms) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let mut batch = self
            .batches()?
            .into_iter()
            .find(|b| b.id == id)
            .ok_or("纠正批次不存在")?;
        if batch.undone_at.is_none() {
            batch.undone_at = Some(now);
            tx.execute(
                "UPDATE correction_batches SET payload=?1 WHERE id=?2",
                params![to_string(&batch)?, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}
