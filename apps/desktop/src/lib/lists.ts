/** Splits on ASCII comma, full-width comma, ideographic comma or newline; trims, drops blanks and duplicates. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,，、\n\r]/)) {
    const item = raw.trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
  }
  return out;
}

/** UTF-8 byte length — the Rust side validates some limits in bytes, not characters. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function charLength(text: string): number {
  return [...text].length;
}
