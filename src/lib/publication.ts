import { asDoc, plainText, type PMDoc, type PMNode, wordCountDoc } from "@/lib/document";

export type Inline =
  | { type: "text"; text: string; marks: string[]; href?: string }
  | { type: "footnote"; id: string; text: string }
  | { type: "break" };

export type Block =
  | { type: "paragraph"; align?: string; inlines: Inline[]; indent: boolean; blank: boolean }
  | { type: "heading"; level: number; inlines: Inline[] }
  | { type: "blockquote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "sceneBreak" }
  | { type: "rule" }
  | { type: "sceneTitle"; text: string };

export type PubChapter = {
  id: string;
  title: string;
  kind: "FRONT" | "BODY" | "BACK";
  showHeading: boolean;
  number: string | null;
  blocks: Block[];
  wordCount: number;
};

export type Publication = {
  title: string;
  author: string;
  language: string;
  description: string;
  revisionCreatedAt: string;
  groupId: string;
  chapters: PubChapter[];
};

export type ChapterSource = {
  id: string;
  title: string;
  kind: "FRONT" | "BODY" | "BACK";
  showHeading: boolean;
  numberMode: string;
  customNumber: string | null;
  sortOrder: number;
  partOrder: number;
  content: unknown;
  wordCount: number;
};

const DEFAULT_SCENE = /^scene(?:\s+\d+)?$/i;

export function toPublication(
  book: { title: string; authorName: string | null; language?: string },
  chapters: ChapterSource[],
  meta: { revisionCreatedAt: string; groupId: string },
  options: { includeFront: boolean; includeBack: boolean; numbering: boolean; chapterIds: string[] | null },
): Publication {
  const ordered = chapters
    .slice()
    .sort((a, b) => a.partOrder - b.partOrder || a.sortOrder - b.sortOrder)
    .filter((chapter) => {
      if (chapter.kind === "FRONT" && !options.includeFront) return false;
      if (chapter.kind === "BACK" && !options.includeBack) return false;
      if (options.chapterIds && !options.chapterIds.includes(chapter.id)) return false;
      return true;
    });
  let bodyNumber = 0;
  const published: PubChapter[] = ordered.map((chapter) => {
    let number: string | null = null;
    if (options.numbering && chapter.kind === "BODY" && chapter.showHeading && chapter.numberMode !== "none") {
      if (chapter.numberMode === "custom" && chapter.customNumber) number = chapter.customNumber;
      else {
        bodyNumber += 1;
        number = String(bodyNumber);
      }
    }
    const doc = asDoc(chapter.content);
    return {
      id: chapter.id,
      title: chapter.title,
      kind: chapter.kind,
      showHeading: chapter.showHeading,
      number,
      blocks: blocksFromDoc(doc),
      wordCount: wordCountDoc(doc) || chapter.wordCount,
    };
  });
  return {
    title: book.title,
    author: book.authorName?.trim() || "Unknown author",
    language: book.language || "en",
    description: plainText(asDoc(ordered[0]?.content)).slice(0, 400),
    revisionCreatedAt: meta.revisionCreatedAt,
    groupId: meta.groupId,
    chapters: published,
  };
}

export function blocksFromDoc(doc: PMDoc): Block[] {
  const blocks: Block[] = [];
  const top = doc.content ?? [];
  const scenes = top.filter((node) => node.type === "scene");
  const nodes = scenes.length > 0 ? scenes : [{ type: "scene", attrs: { title: "" }, content: top }];
  nodes.forEach((scene, index) => {
    const title = String(scene.attrs?.title ?? "").trim();
    if (title && !DEFAULT_SCENE.test(title)) blocks.push({ type: "sceneTitle", text: title });
    for (const child of scene.content ?? []) blocks.push(...nodeToBlocks(child));
  });
  return applyParagraphLayout(blocks);
}

/** The first paragraph of a chapter, the paragraph after a scene break, and the paragraph after a blank line start at the left margin. */
export function applyParagraphLayout(blocks: Block[]): Block[] {
  let suppressIndent = true;
  return blocks.map((block) => {
    if (block.type === "heading" || block.type === "sceneBreak") {
      suppressIndent = true;
      return block;
    }
    if (block.type !== "paragraph") return block;
    const blank = inlineText(block.inlines).trim().length === 0;
    const indent = !suppressIndent && !blank;
    if (blank) suppressIndent = true;
    else if (suppressIndent) suppressIndent = false;
    return { ...block, blank, indent };
  });
}

function nodeToBlocks(node: PMNode): Block[] {
  if (node.type === "paragraph") {
    const inlines = inlinesOf(node);
    return [{ type: "paragraph", align: alignOf(node), inlines, indent: true, blank: false }];
  }
  if (node.type === "heading") {
    return [{ type: "heading", level: Number(node.attrs?.level ?? 2), inlines: inlinesOf(node) }];
  }
  if (node.type === "blockquote") {
    return [{ type: "blockquote", blocks: (node.content ?? []).flatMap(nodeToBlocks) }];
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return [
      {
        type: "list",
        ordered: node.type === "orderedList",
        items: (node.content ?? []).map((item) => inlinesOf(item)),
      },
    ];
  }
  if (node.type === "sceneBreak") return [{ type: "sceneBreak" }];
  if (node.type === "horizontalRule") return [{ type: "rule" }];
  if (node.type === "scene") return blocksFromDoc({ type: "doc", content: [node] });
  return [];
}

function alignOf(node: PMNode): string | undefined {
  const align = node.attrs?.textAlign;
  return typeof align === "string" ? align : undefined;
}

function inlinesOf(node: PMNode): Inline[] {
  const inlines: Inline[] = [];
  const visit = (current: PMNode, inherited: string[]) => {
    if (current.type === "text") {
      const marks = [...inherited, ...(current.marks ?? []).map((mark) => mark.type)];
      const link = (current.marks ?? []).find((mark) => mark.type === "link");
      inlines.push({
        type: "text",
        text: current.text ?? "",
        marks: unique(marks.filter((mark) => mark !== "link")),
        href: link?.attrs?.href ? String(link.attrs.href) : undefined,
      });
      return;
    }
    if (current.type === "footnote") {
      inlines.push({
        type: "footnote",
        id: String(current.attrs?.id ?? inlines.length + 1),
        text: String(current.attrs?.text ?? ""),
      });
      return;
    }
    if (current.type === "hardBreak") {
      inlines.push({ type: "break" });
      return;
    }
    const nextMarks = [...inherited];
    for (const child of current.content ?? []) visit(child, nextMarks);
  };
  for (const child of node.content ?? []) visit(child, []);
  return inlines;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function inlineText(inlines: Inline[]): string {
  return inlines
    .map((inline) => (inline.type === "text" ? inline.text : inline.type === "footnote" ? "" : ""))
    .join("");
}
