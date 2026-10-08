export type Category =
  | "learning"
  | "coding"
  | "research"
  | "entertainment"
  | "communication"
  | "system"
  | "unknown";
export type Relation = "related" | "unrelated" | "unknown";
export interface Activity {
  id: string;
  source: string;
  start: number;
  end: number;
  process: string;
  title: string;
  domain: string;
  intentId: string | null;
  role: "primary" | "supporting";
  idle: boolean;
  area: number;
  category: Category;
  relation: Relation;
  state: string;
  confidence: number;
  reason: string;
}
export interface Project {
  id: string;
  name: string;
  category: Category;
  color: string;
  keywords: string[];
}
export interface Rule {
  id: string;
  field: "app" | "title" | "domain";
  pattern: string;
  category: Category;
  relation: Relation;
  intentId: string | null;
}
export interface Correction {
  activityId: string;
  category: Category;
  relation: Relation;
  overrideIntent?: boolean;
  intentId?: string | null;
}
export interface Session {
  id: string;
  intentId: string | null;
  start: number;
  end: number;
  activeMs: number;
  focusMs: number;
  activityIds: string[];
}
export interface Job {
  id: string;
  tool: string;
  name: string;
  projectId: string | null;
  start: number;
  end: number | null;
  lastSeen: number;
  status: string;
  foregroundMs: number;
  backgroundMs: number;
  parallelMs: number;
}
export interface Settings {
  collectorSource: "auto" | "native" | "activitywatch";
  sampleSeconds: number;
  idleSeconds: number;
  retentionDays: number;
  recordTitles: boolean;
  excludedApps: string[];
  excludedTitles: string[];
  browserToken: string;
}
export interface Stats {
  activeMs: number;
  focusMs: number;
  distractedMs: number;
  interruptionMs: number;
  unknownMs: number;
  idleMs: number;
  deepMs: number;
  longestFocusMs: number;
  backgroundMs: number;
  parallelMs: number;
  switches: number;
  distractionCount: number;
  fragmentation: number;
  projectMs: Record<string, number>;
  categoryMs: Record<string, number>;
}
export interface Snapshot {
  collectorSource: string;
  awStatus: string;
  activities: Activity[];
  sessions: Session[];
  jobs: Job[];
  stats: Stats;
  projects: Project[];
  rules: Rule[];
  settings: Settings;
  recording: boolean;
  breaking: boolean;
  intentId: string | null;
  lastSample: number | null;
  currentApp: string | null;
  error: string | null;
  bridgeReady: boolean;
  bridgeError: string | null;
  browserConnected: boolean;
  databasePath: string;
}
