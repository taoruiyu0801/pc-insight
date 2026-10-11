use super::*;
fn setup() -> Store {
    let mut db = Store::memory().unwrap();
    db.save_project(&Project {
        id: "p".into(),
        name: "Course".into(),
        category: "learning".into(),
        color: "#000000".into(),
        keywords: vec!["course".into()],
    })
    .unwrap();
    db.append(
        "a",
        &Activity {
            id: "a".into(),
            source: "native".into(),
            start: 1_000,
            end: 61_000,
            process: "ChatGPT.exe".into(),
            title: "Question".into(),
            domain: String::new(),
            intent_id: Some("p".into()),
            role: "primary".into(),
            idle: false,
            area: 1.0,
        },
    )
    .unwrap();
    db
}
fn request(start: Ms, end: Ms, relation: &str) -> CorrectionRequest {
    CorrectionRequest {
        ranges: vec![ActivitySpan {
            activity_id: "a".into(),
            start,
            end,
        }],
        change: CorrectionChange {
            category: Some("learning".into()),
            relation: Some(relation.into()),
            override_intent: true,
            intent_id: Some("p".into()),
        },
    }
}
fn derive(db: &Store) -> Vec<Classified> {
    pc_session::derive_with_review(
        &db.activities(0, 100_000).unwrap(),
        &db.projects().unwrap(),
        &db.rules().unwrap(),
        &db.corrections().unwrap(),
        &db.batches().unwrap(),
        &[],
        0,
        100_000,
    )
    .0
}
#[test]
fn partial_correction_never_changes_original_or_outside_selection() {
    let db = setup();
    let raw = db.activities(0, 100_000).unwrap();
    let req = request(11_000, 31_000, "related");
    let preview = db.preview_correction(&req).unwrap();
    assert_eq!(preview.before.unknown_ms, 20_000);
    assert_eq!(preview.after.focus_ms, 20_000);
    db.commit_correction("one", &req, &preview.token, "Confirm", 70_000)
        .unwrap();
    assert_eq!(db.activities(0, 100_000).unwrap(), raw);
    let rows = derive(&db);
    assert_eq!(rows.len(), 3);
    assert_eq!(
        rows.iter()
            .filter(|a| a.state == "focused")
            .map(|a| a.activity.duration())
            .sum::<i64>(),
        20_000
    );
    assert_eq!(
        rows.iter().map(|a| a.activity.duration()).sum::<i64>(),
        60_000
    );
    assert_eq!(rows[0].state, "unknown");
    assert_eq!(rows[2].state, "unknown");
}
#[test]
fn undo_older_batch_preserves_newer_judgment_and_legacy() {
    let db = setup();
    db.correct(&Correction {
        activity_id: "a".into(),
        category: "research".into(),
        relation: "unknown".into(),
        override_intent: false,
        intent_id: None,
    })
    .unwrap();
    let req = request(1_000, 61_000, "related");
    let p = db.preview_correction(&req).unwrap();
    assert_eq!(p.overwritten_manual_count, 1);
    db.commit_correction("one", &req, &p.token, "First", 70_000)
        .unwrap();
    let req2 = request(21_000, 31_000, "unrelated");
    let p2 = db.preview_correction(&req2).unwrap();
    db.commit_correction("two", &req2, &p2.token, "Later", 71_000)
        .unwrap();
    db.undo_correction("one", 72_000).unwrap();
    let rows = derive(&db);
    assert_eq!(
        rows.iter()
            .filter(|a| a.relation == "unrelated")
            .map(|a| a.activity.duration())
            .sum::<i64>(),
        10_000
    );
    assert_eq!(
        rows.iter()
            .filter(|a| a.relation == "unknown")
            .map(|a| a.activity.duration())
            .sum::<i64>(),
        50_000
    );
    db.undo_correction("two", 73_000).unwrap();
    db.undo_correction("two", 74_000).unwrap();
    assert!(derive(&db)
        .iter()
        .all(|a| a.category == "research" && a.relation == "unknown"));
    assert_eq!(db.batches().unwrap()[1].undone_at, Some(73_000));
}
#[test]
fn duplicate_commit_is_idempotent_and_stale_preview_is_rejected() {
    let db = setup();
    let req = request(1_000, 61_000, "related");
    let preview = db.preview_correction(&req).unwrap();
    db.commit_correction("one", &req, &preview.token, "First", 70_000)
        .unwrap();
    db.commit_correction("one", &req, &preview.token, "First", 70_001)
        .unwrap();
    assert_eq!(db.batches().unwrap().len(), 1);
    assert!(db
        .commit_correction("two", &req, &preview.token, "Stale", 70_002)
        .is_err());
    assert_eq!(db.batches().unwrap().len(), 1);
}
#[test]
fn unrelated_new_data_does_not_expire_preview() {
    let mut db = setup();
    let req = request(1_000, 61_000, "related");
    let preview = db.preview_correction(&req).unwrap();
    let mut a = db.activities(0, 100_000).unwrap()[0].clone();
    a.id = "b".into();
    a.start = 100_000;
    a.end = 110_000;
    db.append("b", &a).unwrap();
    db.commit_correction("one", &req, &preview.token, "First", 120_000)
        .unwrap();
}
#[test]
fn duplicate_ranges_do_not_double_count_and_hidden_spans_are_rejected() {
    let db = setup();
    let mut req = request(1_000, 31_000, "related");
    req.ranges.push(ActivitySpan {
        activity_id: "a".into(),
        start: 21_000,
        end: 41_000,
    });
    let preview = db.preview_correction(&req).unwrap();
    assert_eq!(preview.before.active_ms, 40_000);
    assert_eq!(preview.ranges.len(), 1);
    assert!(db
        .preview_correction(&request(1_000, 71_000, "related"))
        .is_err());
}
#[test]
fn app_state_and_control_boundaries_are_separate_from_settings() {
    let db = setup();
    let settings = to_string(&db.settings().unwrap()).unwrap();
    db.control(
        &ControlEvent {
            at: 100,
            kind: "intent".into(),
            intent_id: Some("p".into()),
        },
        true,
    )
    .unwrap();
    db.save_settings(&Settings::default()).unwrap();
    assert_eq!(db.last_intent().unwrap(), Some("p".into()));
    assert_eq!(to_string(&db.settings().unwrap()).unwrap(), settings);
    assert_eq!(db.controls(0, 200).unwrap().len(), 1);
}

#[test]
fn upgrade_and_restart_preserve_legacy_corrections_and_batch_history() {
    let path = std::env::temp_dir().join(format!(
        "pc-insight-review-test-{}.db",
        uuid::Uuid::new_v4()
    ));
    let original = setup();
    {
        let mut db = Store::open(&path).unwrap();
        db.save_project(&original.projects().unwrap()[0]).unwrap();
        db.append("a", &original.activities(0, 100_000).unwrap()[0])
            .unwrap();
        db.correct(&Correction {
            activity_id: "a".into(),
            category: "learning".into(),
            relation: "unknown".into(),
            override_intent: true,
            intent_id: Some("p".into()),
        })
        .unwrap();
        let req = request(11_000, 31_000, "related");
        let preview = db.preview_correction(&req).unwrap();
        db.commit_correction("persisted", &req, &preview.token, "Synthetic", 70_000)
            .unwrap();
    }
    {
        let db = Store::open(&path).unwrap();
        assert_eq!(db.corrections().unwrap().len(), 1);
        assert_eq!(db.batches().unwrap().len(), 1);
        assert_eq!(
            derive(&db)
                .iter()
                .filter(|a| a.state == "focused")
                .map(|a| a.activity.duration())
                .sum::<i64>(),
            20_000
        );
        db.undo_correction("persisted", 80_000).unwrap();
    }
    {
        let db = Store::open(&path).unwrap();
        assert_eq!(db.batches().unwrap()[0].undone_at, Some(80_000));
        assert!(derive(&db).iter().all(|a| a.relation == "unknown"));
    }
    let _ = std::fs::remove_file(path);
}
