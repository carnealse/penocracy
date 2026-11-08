import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inlineText, type Block, type Inline, type Publication } from "@/lib/publication";
import { trimInches, type ExportOptions } from "@/lib/export-options";

export function publicationToTypst(publication: Publication, options: ExportOptions): string {
  const trim = trimInches(options);
  const font = options.font === "mono" ? "Courier Prime" : "Libertinus Serif";
  const inside = options.marginIn + (options.mirrored ? options.gutterIn : 0);
  const outside = options.marginIn;
  const paper = trim.paper ? `paper: "${trim.paper}",` : `width: ${trim.width}in, height: ${trim.height}in,`;
  const lines: string[] = [
    `#set document(title: ${typstString(publication.title)}, author: ${typstString(publication.author)})`,
    `#set text(font: ${typstString(font)}, size: ${options.fontSize}pt, lang: ${typstString(publication.language)}, costs: (widow: 100%, orphan: 100%))`,
    `#set par(justify: ${options.justify}, first-line-indent: 0.25in, leading: 0.15em, spacing: 0pt)`,
    `#set page(${paper}`,
    `  margin: (inside: ${inside}in, outside: ${outside}in, top: ${options.marginIn}in, bottom: ${options.marginIn}in),`,
    options.pageNumbers ? `  numbering: "1",` : "",
    options.header
      ? `  header: context {
    if counter(page).get().first() > 1 {
      set text(size: 9pt)
      [${typstInline(publication.author)}]
      h(1fr)
      [${typstInline(publication.title)}]
    }
  },`
      : "",
    `)`,
    `#show heading.where(level: 1): it => {`,
    options.blankChapterPages ? `  pagebreak(to: "odd", weak: true)` : `  pagebreak(weak: true)`,
    `  set align(center)`,
    `  set par(first-line-indent: 0em)`,
    `  v(1.6em)`,
    `  it`,
    `  v(1.2em)`,
    `}`,
    `#align(center)[`,
    `  #text(size: 22pt)[${typstInline(publication.title)}]`,
    `  #v(0.6em)`,
    `  #text(size: 13pt)[${typstInline(publication.author)}]`,
    `]`,
    `#v(1.5em)`,
    `#outline(title: [Contents], indent: auto)`,
    `#pagebreak()`,
  ];
  for (const chapter of publication.chapters) {
    if (chapter.showHeading) {
      const label = chapter.number ? `Chapter ${chapter.number}. ${chapter.title}` : chapter.title;
      lines.push(`#heading(level: 1)[${typstInline(label)}]`);
    }
    for (const block of chapter.blocks) lines.push(blockToTypst(block, options));
  }
  return lines.filter(Boolean).join("\n");
}

function blockToTypst(block: Block, options: ExportOptions): string {
  if (block.type === "paragraph") {
    if (block.blank) return "#par(first-line-indent: 0in, spacing: 0pt)[#linebreak()]";
    const body = inlinesToTypst(block.inlines);
    const paragraph = block.indent ? `#par[${body}]` : `#par(first-line-indent: 0in)[${body}]`;
    if (block.align && block.align !== "left") return `#align(${block.align})[${paragraph}]`;
    return paragraph;
  }
  if (block.type === "heading") {
    const level = Math.min(4, Math.max(2, block.level));
    return `#heading(level: ${level})[${inlinesToTypst(block.inlines)}]`;
  }
  if (block.type === "blockquote") {
    return `#pad(left: 1.2em)[${block.blocks.map((child) => blockToTypst(child, options)).join("\n")}]`;
  }
  if (block.type === "list") {
    return block.items
      .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inlinesToTypst(item)}`)
      .join("\n");
  }
  if (block.type === "sceneBreak") return `#align(center)[#v(0.8em) \\* \\* \\* #v(0.8em)]`;
  if (block.type === "sceneTitle") return `#align(center)[#text(style: "italic")[${typstInline(block.text)}]]`;
  if (block.type === "rule") return `#line(length: 100%)`;
  return "";
}

function inlinesToTypst(inlines: Inline[]): string {
  if (inlines.length === 0) return "";
  return inlines.map(inlineToTypst).join("");
}

function inlineToTypst(inline: Inline): string {
  if (inline.type === "break") return " \\ ";
  if (inline.type === "footnote") return `#footnote[${typstInline(inline.text)}]`;
  let text = typstInline(inline.text);
  if (inline.href) text = `#link(${typstString(inline.href)})[${text}]`;
  if (inline.marks.includes("bold")) text = `#strong[${text}]`;
  if (inline.marks.includes("italic")) text = `#emph[${text}]`;
  if (inline.marks.includes("underline")) text = `#underline[${text}]`;
  if (inline.marks.includes("strike")) text = `#strike[${text}]`;
  if (inline.marks.includes("superscript")) text = `#super[${text}]`;
  if (inline.marks.includes("subscript")) text = `#sub[${text}]`;
  return text;
}

function typstInline(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/@/g, "\\@")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function typstString(value: string): string {
  return JSON.stringify(value);
}

export async function compileTypst(source: string): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "penocracy-typst-"));
  const input = path.join(directory, "book.typ");
  const output = path.join(directory, "book.pdf");
  const fontPath = path.join(process.cwd(), "assets", "fonts");
  await writeFile(input, source, "utf8");
  try {
    await run(process.env.TYPST_BIN || "typst", ["compile", "--font-path", fontPath, input, output]);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

export function publicationWordCount(publication: Publication): number {
  return publication.chapters.reduce((sum, chapter) => sum + inlineText(chapter.blocks.flatMap(blockText)).split(/\s+/).filter(Boolean).length, 0);
}

function blockText(block: Block): Inline[] {
  if (block.type === "paragraph" || block.type === "heading") return block.inlines;
  if (block.type === "blockquote") return block.blocks.flatMap(blockText);
  if (block.type === "list") return block.items.flat();
  if (block.type === "sceneTitle") return [{ type: "text", text: block.text, marks: [] }];
  return [];
}
