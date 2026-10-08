use pc_domain::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{from_str, to_string};
use std::path::Path;
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

pub struct Store {
    pub conn: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::initialize(conn)
    }
    pub fn memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }
    fn initialize(conn: Connection) -> Result<Self> {
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.execute_batch(include_str!("../../../migrations/001_initial.sql"))?;
        Ok(Self { conn })
    }
    pub fn append(&mut self, key: &str, activity: &Activity) -> Result<bool> {
        if activity.end <= activity.start {
            return Ok(false);
        }
        let tx = self.conn.transaction()?;
        if activity.source == "activitywatch"
            && tx.execute(
                "INSERT OR IGNORE INTO external_keys(source_key) VALUES(?1)",
                [key],
            )? == 0
        {
            return Ok(false);
        }
        let json = to_string(activity)?;
        if tx.execute("INSERT OR IGNORE INTO raw_events(source_key,start_ms,end_ms,payload) VALUES(?1,?2,?3,?4)",params![key,activity.start,activity.end,json])?==0 {return Ok(false)}
        let mut fingerprint = activity.clone();
        fingerprint.id.clear();
        fingerprint.start = 0;
        fingerprint.end = 0;
        fingerprint.area = (fingerprint.area * 10.0).round() / 10.0;
        let fingerprint = to_string(&fingerprint)?;
        let prior: Option<String> = tx
            .query_row(
                "SELECT payload FROM activities WHERE fingerprint=?1 AND end_ms=?2 AND id NOT IN (SELECT activity_id FROM corrections) LIMIT 1",
                params![fingerprint, activity.start],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(prior) = prior {
            let mut merged: Activity = from_str(&prior)?;
            merged.end = activity.end;
            tx.execute(
                "UPDATE activities SET end_ms=?1,payload=?2 WHERE id=?3",
                params![merged.end, to_string(&merged)?, merged.id],
            )?;
        } else {
            tx.execute("INSERT INTO activities(id,start_ms,end_ms,fingerprint,payload) VALUES(?1,?2,?3,?4,?5)",params![activity.id,activity.start,activity.end,fingerprint,json])?;
        }
        tx.commit()?;
        Ok(true)
    }
    pub fn activities(&self, start: Ms, end: Ms) -> Result<Vec<Activity>> {
        let mut stmt = self.conn.prepare(
            "SELECT payload FROM activities WHERE start_ms<?2 AND end_ms>?1 ORDER BY start_ms",
        )?;
        let rows = stmt.query_map(params![start, end], |r| r.get::<_, String>(0))?;
        rows.map(|s| Ok(from_str(&s?)?)).collect()
    }
    fn list<T: serde::de::DeserializeOwned>(&self, table: &str) -> Result<Vec<T>> {
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT payload FROM {table} ORDER BY rowid"))?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.map(|s| Ok(from_str(&s?)?)).collect()
    }
    fn put<T: serde::Serialize>(&self, table: &str, id: &str, value: &T) -> Result<()> {
        self.conn.execute(&format!("INSERT INTO {table}(id,payload) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload"),params![id,to_string(value)?])?;
        Ok(())
    }
    pub fn projects(&self) -> Result<Vec<Project>> {
        self.list("projects")
    }
    pub fn rules(&self) -> Result<Vec<Rule>> {
        self.list("rules")
    }
    pub fn corrections(&self) -> Result<Vec<Correction>> {
        self.list("corrections")
    }
    pub fn jobs(&self) -> Result<Vec<BackgroundJob>> {
        self.list("background_jobs")
    }
    pub fn save_project(&self, p: &Project) -> Result<()> {
        self.put("projects", &p.id, p)
    }
    pub fn save_rule(&self, r: &Rule) -> Result<()> {
        self.put("rules", &r.id, r)
    }
    pub fn delete_rule(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM rules WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn save_job(&self, j: &BackgroundJob) -> Result<()> {
        self.put("background_jobs", &j.id, j)
    }
    pub fn correct(&self, c: &Correction) -> Result<()> {
        self.conn.execute("INSERT INTO corrections(activity_id,payload) VALUES(?1,?2) ON CONFLICT(activity_id) DO UPDATE SET payload=excluded.payload",params![c.activity_id,to_string(c)?])?;
        Ok(())
    }
    pub fn settings(&self) -> Result<Settings> {
        let json: Option<String> = self
            .conn
            .query_row("SELECT payload FROM settings WHERE id='main'", [], |r| {
                r.get(0)
            })
            .optional()?;
        Ok(json.map(|s| from_str(&s)).transpose()?.unwrap_or_default())
    }
    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        self.put("settings", "main", s)
    }
    pub fn prune(&self, cutoff: Ms) -> Result<usize> {
        Ok(self
            .conn
            .execute("DELETE FROM raw_events WHERE end_ms<?1", [cutoff])?)
    }
    pub fn heartbeat_jobs(&self, now: Ms) -> Result<()> {
        for mut j in self.jobs()?.into_iter().filter(|j| j.status == "running") {
            if now - j.last_seen > 15_000 {
                j.status = "interrupted".into();
                j.end = Some(j.last_seen);
            } else {
                j.last_seen = now;
            }
            self.save_job(&j)?;
        }
        Ok(())
    }
    pub fn recover_jobs(&self) -> Result<()> {
        for mut j in self.jobs()?.into_iter().filter(|j| j.status == "running") {
            j.end = Some(j.last_seen);
            j.status = "interrupted".into();
            self.save_job(&j)?
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn immutable_idempotent_raw_survives_as_activity_after_retention() {
        let mut db = Store::memory().unwrap();
        let a = Activity {
            id: "a".into(),
            source: "native".into(),
            start: 0,
            end: 1000,
            process: "code.exe".into(),
            title: "Title".into(),
            domain: "".into(),
            intent_id: None,
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        assert!(db.append("key1", &a).unwrap());
        assert!(!db.append("key1", &a).unwrap());
        let mut b = a.clone();
        b.id = "b".into();
        b.start = 1000;
        b.end = 2000;
        db.append("key2", &b).unwrap();
        let out = db.activities(0, 3000).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].end, 2000);
        assert!(db
            .conn
            .execute("UPDATE raw_events SET payload='{}'", [])
            .is_err());
        db.prune(3000).unwrap();
        assert_eq!(db.activities(0, 3000).unwrap().len(), 1);
    }
    #[test]
    fn imported_events_stay_idempotent_after_raw_cleanup() {
        let mut db = Store::memory().unwrap();
        let a = Activity {
            id: "aw".into(),
            source: "activitywatch".into(),
            start: 0,
            end: 1000,
            process: "edge.exe".into(),
            title: "".into(),
            domain: "".into(),
            intent_id: None,
            role: "primary".into(),
            idle: false,
            area: 1.0,
        };
        assert!(db.append("aw:key", &a).unwrap());
        db.prune(2000).unwrap();
        assert!(!db.append("aw:key", &a).unwrap());
        assert_eq!(db.activities(0, 2000).unwrap().len(), 1);
    }
}
