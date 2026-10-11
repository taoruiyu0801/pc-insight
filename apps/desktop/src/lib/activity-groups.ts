import type {
  Activity,
  ActivitySpan,
  Session,
} from "../../../../packages/types";

export interface ActivityGroup extends Activity {
  groupMembers?: Activity[];
}
export const spanOf = (a: Activity): ActivitySpan => ({
  activityId: a.id,
  start: a.start,
  end: a.end,
});
export const membersOf = (a: ActivityGroup): Activity[] =>
  a.groupMembers ?? [a];

export function learningTool(a: Activity): string | null {
  const process = a.process.toLowerCase(),
    domain = a.domain.toLowerCase(),
    title = a.title.toLowerCase();
  const browser = ["msedge.exe", "chrome.exe", "firefox.exe"].includes(process);
  if (
    process === "chatgpt.exe" ||
    (browser &&
      (["chatgpt.com", "chat.openai.com"].includes(domain) ||
        title.includes("chatgpt")))
  )
    return "ChatGPT";
  if (process === "goldendict.exe") return "词典";
  if (["typora.exe", "obsidian.exe", "onenote.exe"].includes(process))
    return "笔记";
  return null;
}

/** Presentation only: preserve the exact member ranges for details/corrections. */
export function groupActivities(
  input: Activity[],
  sessions: Session[] = [],
): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  const sessionIndex = new Map(
    sessions.flatMap((s) =>
      s.members.map(
        (m) => [`${m.activityId}:${m.start}:${m.end}`, s.id] as const,
      ),
    ),
  );
  const sessionOf = (a: Activity) =>
    sessionIndex.get(`${a.id}:${a.start}:${a.end}`);
  for (const a of input.slice().sort((a, b) => a.start - b.start)) {
    const last = groups.at(-1);
    const keys = [
      "source",
      "process",
      "title",
      "domain",
      "intentId",
      "category",
      "relation",
      "state",
      "idle",
      "role",
    ] as const;
    if (
      last &&
      a.role === "primary" &&
      last.end === a.start &&
      keys.every((k) => last[k] === a[k]) &&
      sessionOf(membersOf(last)[0]) === sessionOf(a)
    ) {
      last.end = a.end;
      last.groupMembers!.push(a);
    } else groups.push({ ...a, groupMembers: [a] });
  }
  return groups;
}
