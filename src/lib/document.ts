import { sha256Hex } from "@/lib/sha256";

export type Mark = { type: string; attrs?: Record<string, unknown> };

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Mark[];
};

export type PMDoc = { type: "doc"; content: PMNode[] };

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function emptyParagraph(): PMNode {
  return { type: "paragraph" };
}

export function sceneNode(id = newId(), title = "Scene 1"): PMNode {
  return {
    type: "scene",
    attrs: { id, title },
    content: [emptyParagraph()],
  };
}

export function emptyDocument(sceneId = newId()): PMDoc {
  return { type: "doc", content: [sceneNode(sceneId, "Scene 1")] };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashDoc(doc: PMDoc): string {
  return sha256Hex(stableStringify(doc));
}

export function isDoc(value: unknown): value is PMDoc {
  return (
    !!value &&
    typeof value === "object" &&
    (value as PMDoc).type === "doc" &&
    Array.isArray((value as PMDoc).content)
  );
}

export function asDoc(value: unknown): PMDoc {
  return isDoc(value) ? value : emptyDocument();
}

function walk(node: PMNode, visit: (node: PMNode) => void) {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

export function textOf(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "footnote") return "";
  return (node.content ?? []).map(textOf).join(node.type === "paragraph" ? "" : "");
}

export function plainText(doc: PMDoc): string {
  const chunks: string[] = [];
  const visit = (node: PMNode) => {
    if (node.type === "text") chunks.push(node.text ?? "");
    if (node.type === "paragraph" || node.type === "heading") chunks.push("\n");
  };
  for (const node of doc.content ?? []) walk(node, visit);
  return chunks.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function wordCountText(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words?.length ?? 0;
}

export function wordCountDoc(doc: PMDoc): number {
  return wordCountText(plainText(doc));
}

export function charCountDoc(doc: PMDoc): number {
  return plainText(doc).length;
}

export type SceneSlice = {
  id: string;
  title: string;
  sortOrder: number;
  wordCount: number;
  node: PMNode;
};

export function extractScenes(doc: PMDoc): SceneSlice[] {
  const scenes = (doc.content ?? []).filter((node) => node.type === "scene");
  const source = scenes.length > 0 ? scenes : [{ type: "scene", attrs: { id: "body", title: "" }, content: doc.content ?? [] }];
  return source.map((node, index) => {
    const nested: PMDoc = { type: "doc", content: node.content ?? [] };
    return {
      id: String(node.attrs?.id ?? `scene-${index}`),
      title: String(node.attrs?.title ?? ""),
      sortOrder: index,
      wordCount: wordCountDoc(nested),
      node,
    };
  });
}

export function previewText(doc: PMDoc, limit = 280): string {
  const text = plainText(doc).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

export type ParagraphSnap = {
  text: string;
  kind: string;
};

export function paragraphsOf(doc: PMDoc): ParagraphSnap[] {
  const snaps: ParagraphSnap[] = [];
  const visit = (node: PMNode) => {
    if (node.type === "paragraph" || node.type === "heading" || node.type === "sceneBreak") {
      snaps.push({
        kind: node.type === "heading" ? `h${node.attrs?.level ?? 1}` : node.type,
        text: node.type === "sceneBreak" ? "* * *" : textOf(node).replace(/\s+/g, " ").trim(),
      });
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of doc.content ?? []) visit(node);
  return snaps.filter((item) => item.text.length > 0 || item.kind === "sceneBreak");
}

export type DiffRow = {
  type: "same" | "added" | "removed";
  text: string;
  kind: string;
};

export function diffParagraphs(before: ParagraphSnap[], after: ParagraphSnap[]): DiffRow[] {
  const a = before.map((item) => `${item.kind}:${item.text}`);
  const b = after.map((item) => `${item.kind}:${item.text}`);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: before[i].text, kind: before[i].kind });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "removed", text: before[i].text, kind: before[i].kind });
      i += 1;
    } else {
      rows.push({ type: "added", text: after[j].text, kind: after[j].kind });
      j += 1;
    }
  }
  while (i < a.length) {
    rows.push({ type: "removed", text: before[i].text, kind: before[i].kind });
    i += 1;
  }
  while (j < b.length) {
    rows.push({ type: "added", text: after[j].text, kind: after[j].kind });
    j += 1;
  }
  return rows;
}

export type ReplaceOptions = { caseSensitive?: boolean };

export function replaceInDoc(doc: PMDoc, query: string, replacement: string, options: ReplaceOptions = {}): { doc: PMDoc; count: number } {
  if (!query) return { doc, count: 0 };
  let count = 0;
  const flags = options.caseSensitive ? "g" : "gi";
  const pattern = new RegExp(escapeRegExp(query), flags);
  const next = structuredClone(doc) as PMDoc;
  const visit = (node: PMNode) => {
    if (node.type === "text" && node.text) {
      const updated = node.text.replace(pattern, () => {
        count += 1;
        return replacement;
      });
      node.text = updated;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(next);
  return { doc: next, count };
}

export function countMatches(doc: PMDoc, query: string, options: ReplaceOptions = {}): number {
  if (!query) return 0;
  const flags = options.caseSensitive ? "g" : "gi";
  const pattern = new RegExp(escapeRegExp(query), flags);
  return plainText(doc).match(pattern)?.length ?? 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function commentIds(doc: PMDoc): string[] {
  const ids = new Set<string>();
  const visit = (node: PMNode) => {
    for (const mark of node.marks ?? []) {
      if (mark.type === "comment" && mark.attrs?.id) ids.add(String(mark.attrs.id));
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return [...ids];
}

export function bookmarkIds(doc: PMDoc): string[] {
  const ids = new Set<string>();
  const visit = (node: PMNode) => {
    for (const mark of node.marks ?? []) {
      if (mark.type === "bookmark" && mark.attrs?.id) ids.add(String(mark.attrs.id));
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return [...ids];
}

export type ReviewIssue = {
  rule: "repeated-word" | "double-space" | "trailing-space" | "space-before-punctuation" | "mixed-quotes";
  message: string;
  excerpt: string;
};

export function reviewDocument(doc: PMDoc): ReviewIssue[] {
  const text = plainText(doc);
  const issues: ReviewIssue[] = [];
  const repeated = text.match(/\b([A-Za-z']{2,})\s+\1\b/gi) ?? [];
  for (const match of repeated.slice(0, 20)) {
    issues.push({
      rule: "repeated-word",
      message: "The same word appears twice in a row.",
      excerpt: match,
    });
  }
  if (/ {2,}/.test(text)) {
    issues.push({
      rule: "double-space",
      message: "Two or more spaces appear between words.",
      excerpt: "double space",
    });
  }
  if (/[ \t]+\n/.test(`${text}\n`) || /[ \t]+$/.test(text)) {
    issues.push({
      rule: "trailing-space",
      message: "A line ends with whitespace.",
      excerpt: "trailing space",
    });
  }
  const spacedPunct = text.match(/\s+[,.;:!?]/g) ?? [];
  if (spacedPunct.length > 0) {
    issues.push({
      rule: "space-before-punctuation",
      message: "A space sits before punctuation.",
      excerpt: spacedPunct[0] ?? "",
    });
  }
  const straight = /["']/.test(text);
  const curly = /[“”‘’]/.test(text);
  if (straight && curly) {
    issues.push({
      rule: "mixed-quotes",
      message: "Straight and curly quotation marks are both used.",
      excerpt: "\" and “",
    });
  }
  return issues;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function insertionIndex(ids: string[], previousId: string | null, nextId: string | null): number {
  if (previousId) {
    const index = ids.indexOf(previousId);
    if (index >= 0) return index + 1;
  }
  if (nextId) {
    const index = ids.indexOf(nextId);
    if (index >= 0) return index;
  }
  return ids.length;
}

export function docFromParagraphs(
  paragraphs: Array<{ kind: string; text: string; level?: number; bold?: boolean; italic?: boolean }>,
): PMDoc {
  const sceneId = newId();
  const content: PMNode[] = paragraphs.map((paragraph) => {
    if (paragraph.kind === "sceneBreak") return { type: "sceneBreak" };
    if (paragraph.kind === "heading") {
      return {
        type: "heading",
        attrs: { level: paragraph.level ?? 2 },
        content: paragraph.text ? [textNode(paragraph.text, paragraph)] : [],
      };
    }
    if (paragraph.kind === "quote") {
      return {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: paragraph.text ? [textNode(paragraph.text, paragraph)] : [],
          },
        ],
      };
    }
    return {
      type: "paragraph",
      content: paragraph.text ? [textNode(paragraph.text, paragraph)] : [],
    };
  });
  return {
    type: "doc",
    content: [
      {
        type: "scene",
        attrs: { id: sceneId, title: "" },
        content: content.length > 0 ? content : [emptyParagraph()],
      },
    ],
  };
}

function textNode(
  text: string,
  marks: { bold?: boolean; italic?: boolean },
): PMNode {
  const applied: Mark[] = [];
  if (marks.bold) applied.push({ type: "bold" });
  if (marks.italic) applied.push({ type: "italic" });
  return applied.length > 0 ? { type: "text", text, marks: applied } : { type: "text", text };
}
