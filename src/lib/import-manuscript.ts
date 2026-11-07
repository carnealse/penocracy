import { parseHTML } from "linkedom";
import mammoth from "mammoth";
import JSZip from "jszip";
import { docFromParagraphs, wordCountText } from "@/lib/document";

export type ImportParagraph = {
  kind: "paragraph" | "heading" | "sceneBreak" | "quote";
  level?: number;
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type ImportChapter = {
  title: string;
  paragraphs: ImportParagraph[];
};

export type ImportPreview = {
  suggestedTitle: string;
  chapters: ImportChapter[];
  warnings: string[];
};

const CHAPTER_LINE = /^(?:chapter|part)\s+([0-9ivxlcdm]+|[a-z]+)\b[^\n]*$/i;
const MARKDOWN_HEADING = /^(#{1,3})\s+(.+)$/;
const SCENE_LINE = /^(?:\*\s*\*\s*\*|\#|\-{3,}|_{3,})$/;

export async function previewManuscript(fileName: string, data: Buffer): Promise<ImportPreview> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".text") || lower.endsWith(".md")) {
    return previewText(fileName, data.toString("utf8"));
  }
  if (lower.endsWith(".docx")) return previewDocx(fileName, data);
  if (lower.endsWith(".epub")) return previewEpub(fileName, data);
  throw new Error("Import accepts DOCX, EPUB, and TXT files.");
}

export function previewText(fileName: string, text: string): ImportPreview {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chapters: ImportChapter[] = [];
  let current: ImportChapter = { title: titleFromFile(fileName), paragraphs: [] };
  let buffer: string[] = [];
  const flush = () => {
    const paragraph = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (paragraph) current.paragraphs.push({ kind: "paragraph", text: paragraph });
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const markdown = trimmed.match(MARKDOWN_HEADING);
    if (CHAPTER_LINE.test(trimmed) || markdown) {
      flush();
      if (current.paragraphs.length > 0 || chapters.length > 0) chapters.push(current);
      current = {
        title: (markdown?.[2] ?? trimmed).trim(),
        paragraphs: [],
      };
      continue;
    }
    if (SCENE_LINE.test(trimmed)) {
      flush();
      current.paragraphs.push({ kind: "sceneBreak", text: "* * *" });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    buffer.push(trimmed);
  }
  flush();
  if (current.paragraphs.length > 0 || chapters.length === 0) chapters.push(current);
  const usable = chapters.filter((chapter) => chapter.paragraphs.length > 0 || chapter.title);
  return {
    suggestedTitle: usable[0]?.title || titleFromFile(fileName),
    chapters: usable.length > 0 ? usable : [{ title: "Chapter 1", paragraphs: [] }],
    warnings: ["Plain text keeps paragraphs, detected headings, and scene breaks. Fonts, images, and layout are not in the file."],
  };
}

async function previewDocx(fileName: string, data: Buffer): Promise<ImportPreview> {
  const result = await mammoth.convertToHtml({ buffer: data });
  const warnings = result.messages.map((message) => message.message);
  warnings.push("Images, text boxes, and uncommon Word styles are dropped. Bold, italic, headings, and paragraphs are kept.");
  const parsed = htmlToChapters(result.value, titleFromFile(fileName));
  return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
}

async function previewEpub(fileName: string, data: Buffer): Promise<ImportPreview> {
  const zip = await JSZip.loadAsync(data);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("This EPUB has no META-INF/container.xml.");
  const root = container.match(/full-path="([^"]+)"/)?.[1];
  if (!root) throw new Error("This EPUB does not point at a package document.");
  const opf = await zip.file(root)?.async("string");
  if (!opf) throw new Error("The EPUB package document is missing.");
  const base = root.includes("/") ? root.slice(0, root.lastIndexOf("/") + 1) : "";
  const title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1]?.trim() || titleFromFile(fileName);
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item\b[^>]*>/g)) {
    const tag = match[0];
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*>/g)]
    .map((match) => attr(match[0], "idref"))
    .filter((id): id is string => !!id);
  const chapters: ImportChapter[] = [];
  const warnings = [
    "EPUB import keeps headings, paragraphs, bold, italic, and scene breaks. Fixed-layout pages, audio, and video are skipped.",
  ];
  for (const id of spine) {
    const href = manifest.get(id);
    if (!href || !/\.x?html?$/i.test(href)) continue;
    const file = zip.file(`${base}${href}`) ?? zip.file(href);
    if (!file) {
      warnings.push(`Missing spine document ${href}.`);
      continue;
    }
    const html = await file.async("string");
    const parsed = htmlToChapters(html, href);
    chapters.push(...parsed.chapters);
    warnings.push(...parsed.warnings);
  }
  return {
    suggestedTitle: title,
    chapters: chapters.length > 0 ? chapters : [{ title: "Chapter 1", paragraphs: [] }],
    warnings: unique(warnings),
  };
}

export function htmlToChapters(html: string, fallbackTitle: string): ImportPreview {
  const { document } = parseHTML(`<!doctype html><body>${html}</body>`);
  const chapters: ImportChapter[] = [];
  let current: ImportChapter = { title: fallbackTitle, paragraphs: [] };
  const warnings: string[] = [];
  const pushChapter = () => {
    if (current.paragraphs.length > 0) chapters.push(current);
  };
  const elements = [...document.body.children];
  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2") {
      pushChapter();
      current = { title: element.textContent?.trim() || "Untitled chapter", paragraphs: [] };
      return;
    }
    if (tag === "img" || tag === "svg" || tag === "video" || tag === "audio") {
      warnings.push(`Skipped ${tag}. Import does not keep media.`);
      return;
    }
    if (tag === "table") {
      warnings.push("A table was flattened into paragraphs.");
      for (const row of element.querySelectorAll("tr")) {
        const text = row.textContent?.replace(/\s+/g, " ").trim();
        if (text) current.paragraphs.push({ kind: "paragraph", text });
      }
      return;
    }
    if (tag === "hr") {
      current.paragraphs.push({ kind: "sceneBreak", text: "* * *" });
      return;
    }
    if (tag === "blockquote") {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text) current.paragraphs.push({ kind: "quote", text, ...marksOf(element) });
      return;
    }
    if (tag === "p" || tag === "li" || tag === "h3" || tag === "h4") {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) return;
      if (text === "* * *" || text === "***" || text === "---") {
        current.paragraphs.push({ kind: "sceneBreak", text: "* * *" });
        return;
      }
      current.paragraphs.push({
        kind: tag === "h3" || tag === "h4" ? "heading" : "paragraph",
        level: tag === "h3" ? 2 : tag === "h4" ? 3 : undefined,
        text,
        ...marksOf(element),
      });
      return;
    }
    if (element.children.length > 0) {
      for (const child of element.children) visit(child);
      return;
    }
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    if (text) current.paragraphs.push({ kind: "paragraph", text });
  };
  for (const element of elements) visit(element);
  pushChapter();
  if (chapters.length === 0) {
    chapters.push({ title: fallbackTitle, paragraphs: [] });
  }
  return { suggestedTitle: chapters[0]?.title || fallbackTitle, chapters, warnings: unique(warnings) };
}

function marksOf(element: Element): { bold?: boolean; italic?: boolean } {
  const html = element.innerHTML.toLowerCase();
  return {
    bold: html.includes("<strong") || html.includes("<b"),
    italic: html.includes("<em") || html.includes("<i"),
  };
}

export function chaptersToDocuments(chapters: ImportChapter[]) {
  return chapters.map((chapter, index) => {
    const doc = docFromParagraphs(
      chapter.paragraphs.length > 0
        ? chapter.paragraphs
        : [{ kind: "paragraph", text: "" }],
    );
    const words = chapter.paragraphs.reduce((sum, paragraph) => sum + wordCountText(paragraph.text), 0);
    return {
      title: chapter.title.trim() || `Chapter ${index + 1}`,
      doc,
      wordCount: words,
    };
  });
}

function titleFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Imported manuscript";
}

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
