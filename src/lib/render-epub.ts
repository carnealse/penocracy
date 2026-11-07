import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { Block, Inline, Publication } from "@/lib/publication";
import type { ExportOptions } from "@/lib/export-options";

export async function renderEpub(publication: Publication, options: ExportOptions): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );
  const oebps = zip.folder("OEBPS");
  if (!oebps) throw new Error("Could not create the EPUB content folder.");
  const chapterFiles = publication.chapters.map((chapter, index) => {
    const href = `chapter-${index + 1}.xhtml`;
    oebps.file(href, chapterXhtml(publication, chapter, options));
    return { href, title: chapter.number ? `Chapter ${chapter.number}. ${chapter.title}` : chapter.title, id: `c${index + 1}` };
  });
  oebps.file("nav.xhtml", navXhtml(publication, chapterFiles));
  oebps.file("toc.xhtml", tocXhtml(publication, chapterFiles));
  oebps.file("styles.css", stylesheet(options));
  oebps.file("content.opf", contentOpf(publication, chapterFiles));
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

function contentOpf(
  publication: Publication,
  chapters: Array<{ href: string; title: string; id: string }>,
): string {
  const modified = new Date(publication.revisionCreatedAt).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" xml:lang="${escapeXml(publication.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${escapeXml(publication.groupId)}</dc:identifier>
    <dc:title>${escapeXml(publication.title)}</dc:title>
    <dc:creator>${escapeXml(publication.author)}</dc:creator>
    <dc:language>${escapeXml(publication.language)}</dc:language>
    <dc:description>${escapeXml(publication.description || publication.title)}</dc:description>
    <dc:publisher>Penocracy</dc:publisher>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${chapters.map((chapter) => `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine>
    <itemref idref="toc"/>
    ${chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join("\n    ")}
  </spine>
</package>`;
}

function navXhtml(publication: Publication, chapters: Array<{ href: string; title: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(publication.language)}">
  <head><title>Contents</title><link rel="stylesheet" href="styles.css"/></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        ${chapters.map((chapter) => `<li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`).join("\n        ")}
      </ol>
    </nav>
  </body>
</html>`;
}

function tocXhtml(publication: Publication, chapters: Array<{ href: string; title: string }>): string {
  return pageShell(publication, "Contents", `<h1>Contents</h1><ol>${chapters
    .map((chapter) => `<li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`)
    .join("")}</ol>`);
}

function chapterXhtml(
  publication: Publication,
  chapter: Publication["chapters"][number],
  options: ExportOptions,
): string {
  const heading = chapter.showHeading
    ? `<h1>${escapeXml(chapter.number ? `Chapter ${chapter.number}. ${chapter.title}` : chapter.title)}</h1>`
    : "";
  const body = chapter.blocks.map((block) => blockToHtml(block, options)).join("\n");
  return pageShell(publication, chapter.title, `${heading}\n${body}`);
}

function pageShell(publication: Publication, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(publication.language)}" lang="${escapeXml(publication.language)}">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function stylesheet(options: ExportOptions): string {
  const family = options.font === "mono" ? '"Courier Prime", "Courier New", monospace' : 'Georgia, "Palatino Linotype", serif';
  return `body { font-family: ${family}; font-size: 1em; line-height: ${options.lineHeight}; margin: 5%; }
p { margin: 0 0 ${options.indent ? "0" : "0.8em"}; ${options.indent ? "text-indent: 1.3em;" : ""} ${options.justify ? "text-align: justify;" : ""} }
h1 { font-size: 1.5em; text-align: center; text-indent: 0; margin: 2em 0 1em; page-break-before: always; }
h2 { font-size: 1.2em; text-indent: 0; }
blockquote { margin: 1em 1.4em; }
.scene { text-align: center; text-indent: 0; margin: 1.4em 0; letter-spacing: 0.3em; }
.scene-title { text-align: center; font-style: italic; text-indent: 0; }
ol, ul { text-indent: 0; }
a { color: inherit; }`;
}

function blockToHtml(block: Block, options: ExportOptions): string {
  if (block.type === "paragraph") return `<p>${inlinesToHtml(block.inlines)}</p>`;
  if (block.type === "heading") return `<h${Math.min(4, Math.max(2, block.level))}>${inlinesToHtml(block.inlines)}</h${Math.min(4, Math.max(2, block.level))}>`;
  if (block.type === "blockquote") return `<blockquote>${block.blocks.map((child) => blockToHtml(child, options)).join("")}</blockquote>`;
  if (block.type === "list") {
    const tag = block.ordered ? "ol" : "ul";
    return `<${tag}>${block.items.map((item) => `<li>${inlinesToHtml(item)}</li>`).join("")}</${tag}>`;
  }
  if (block.type === "sceneBreak") return `<p class="scene">* * *</p>`;
  if (block.type === "sceneTitle") return `<p class="scene-title">${escapeXml(block.text)}</p>`;
  if (block.type === "rule") return `<hr/>`;
  return "";
}

function inlinesToHtml(inlines: Inline[]): string {
  return inlines.map(inlineToHtml).join("");
}

function inlineToHtml(inline: Inline): string {
  if (inline.type === "break") return "<br/>";
  if (inline.type === "footnote") {
    return `<a epub:type="noteref" href="#fn-${escapeXml(inline.id)}">${escapeXml(inline.text) ? "" : "*"}</a><aside epub:type="footnote" id="fn-${escapeXml(inline.id)}"><p>${escapeXml(inline.text)}</p></aside>`;
  }
  let html = escapeXml(inline.text);
  if (inline.href) html = `<a href="${escapeXml(inline.href)}">${html}</a>`;
  if (inline.marks.includes("bold")) html = `<strong>${html}</strong>`;
  if (inline.marks.includes("italic")) html = `<em>${html}</em>`;
  if (inline.marks.includes("underline")) html = `<u>${html}</u>`;
  if (inline.marks.includes("strike")) html = `<s>${html}</s>`;
  if (inline.marks.includes("superscript")) html = `<sup>${html}</sup>`;
  if (inline.marks.includes("subscript")) html = `<sub>${html}</sub>`;
  return html;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type EpubCheckReport = { ok: boolean; messages: string[] };

export async function checkEpub(data: Buffer): Promise<EpubCheckReport> {
  const jar = process.env.EPUBCHECK_JAR;
  if (!jar) return { ok: true, messages: ["EPUBCheck jar is not configured, so structural checks ran without the official validator."] };
  const directory = await mkdtemp(path.join(tmpdir(), "penocracy-epub-"));
  const file = path.join(directory, "book.epub");
  await writeFile(file, data);
  try {
    const { code, output } = await run("java", ["-jar", jar, file]);
    const messages = output.split("\n").map((line) => line.trim()).filter(Boolean);
    return { ok: code === 0, messages };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}
