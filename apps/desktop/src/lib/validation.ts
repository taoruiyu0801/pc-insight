import { byteLength, charLength, parseList } from "./lists";
import { categories } from "./semantics";

export type FieldErrors = Record<string, string>;

export interface ProjectInput {
  name: string;
  category: string;
  color: string;
  keywords: string;
}

/** Mirrors `save_project`: name 1–80 chars, ≤30 keywords, each ≤200 UTF-8 bytes, #RRGGBB. */
export function validateProject(p: ProjectInput): FieldErrors {
  const e: FieldErrors = {};
  const name = p.name.trim();
  if (!name) e.name = "请填写项目名称";
  else if (charLength(name) > 80)
    e.name = `名称最多 80 个字符，当前 ${charLength(name)}`;
  if (!(p.category in categories)) e.category = "请选择项目类别";
  if (!/^#[0-9a-fA-F]{6}$/.test(p.color)) e.color = "颜色需为 #RRGGBB 格式";
  const keywords = parseList(p.keywords);
  if (keywords.length > 30)
    e.keywords = `最多 30 个关键词，当前 ${keywords.length} 个`;
  else {
    const long = keywords.find((k) => byteLength(k) > 200);
    if (long)
      e.keywords = `关键词「${long.slice(0, 12)}…」过长（中文约 66 字以内）`;
  }
  return e;
}

export interface RuleInput {
  field: string;
  pattern: string;
  category: string;
  relation: string;
}

export function validateRule(r: RuleInput): FieldErrors {
  const e: FieldErrors = {};
  const pattern = r.pattern.trim();
  if (!pattern) e.pattern = "请填写要匹配的关键词";
  else if (charLength(pattern) > 200) e.pattern = "关键词最多 200 个字符";
  if (!["app", "title", "domain"].includes(r.field)) e.field = "请选择匹配字段";
  if (!(r.category in categories)) e.category = "请选择分类";
  if (!["related", "unrelated", "unknown"].includes(r.relation))
    e.relation = "请选择关系";
  return e;
}

export function validateJob(j: { name: string; tool: string }): FieldErrors {
  const e: FieldErrors = {};
  const name = j.name.trim();
  if (!name) e.name = "请填写任务名称";
  else if (charLength(name) > 120) e.name = "任务名称最多 120 个字符";
  if (!["codex", "claude", "python", "ffmpeg", "npm", "other"].includes(j.tool))
    e.tool = "请选择工具";
  return e;
}
