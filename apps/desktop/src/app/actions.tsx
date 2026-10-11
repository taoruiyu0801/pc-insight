import { createContext, useContext } from "react";
import type {
  Activity,
  Job,
  Project,
  Session,
} from "../../../../packages/types";

export type PageId =
  "today" | "timeline" | "analytics" | "projects" | "reports" | "settings";

export interface AppActions {
  go: (page: PageId) => void;
  openActivity: (a: Activity) => void;
  openJob: (j: Job) => void;
  editProject: (p: Project | null) => void;
  newRule: () => void;
  newJob: () => void;
  /** Jump to the timeline page focused on an activity. */
  showInTimeline: (a: Activity) => void;
  openSession: (s: Session) => void;
  showSessionInTimeline: (s: Session) => void;
  openHistory: () => void;
}

export const ActionsContext = createContext<AppActions | null>(null);

export function useActions(): AppActions {
  const a = useContext(ActionsContext);
  if (!a) throw new Error("ActionsContext missing");
  return a;
}
