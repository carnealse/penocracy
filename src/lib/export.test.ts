import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { chaptersToDocuments, previewText } from "@/lib/import-manuscript";
import { toPublication } from "@/lib/publication";
import { presetDefaults } from "@/lib/export-options";
import { renderDocx } from "@/lib/render-docx";
import { checkEpub, renderEpub } from "@/lib/render-epub";
import { compileTypst, publicationToTypst } from "@/lib/render-typst";

const publication = toPublication(
  { title: "The Amber Road", authorName: "Ada Quinn" },
  [
    {
      id: "c1",
      title: "Departure",
      kind: "BODY",
      showHeading: true,
      numberMode: "auto",
      customNumber: null,
      sortOrder: 0,
      partOrder: 1,
      wordCount: 8,
      content: chaptersToDocuments([
        {
          title: "Departure",
          paragraphs: [
            { kind: "paragraph", text: "Café snow fell.", bold: true },
            { kind: "sceneBreak", text: "* * *" },
            { kind: "paragraph", text: "She kept the italic road.", italic: true },
          ],
        },
      ])[0].doc,
    },
    {
      id: "c2",
      title: "Return",
      kind: "BODY",
      showHeading: true,
      numberMode: "auto",
      customNumber: null,
      sortOrder: 1,
      partOrder: 1,
      wordCount: 3,
      content: chaptersToDocuments([{ title: "Return", paragraphs: [{ kind: "paragraph", text: "Home again." }] }])[0].doc,
    },
  ],
  { revisionCreatedAt: "2026-11-07T20:00:00.000Z", groupId: "11111111-1111-1111-1111-111111111111" },
  { includeFront: true, includeBack: true, numbering: true, chapterIds: null },
);

describe("publishing", () => {
  it("numbers chapters in manuscript order", () => {
    expect(publication.chapters.map((chapter) => chapter.number)).toEqual(["1", "2"]);
    expect(publication.chapters[0]?.blocks.some((block) => block.type === "sceneBreak")).toBe(true);
  });

  it("splits a plain-text manuscript on chapter headings", () => {
    const preview = previewText("notes.txt", "Chapter 1\n\nThe road.\n\n***\n\nChapter 2\n\nThe harbor.\n");
    expect(preview.chapters.map((chapter) => chapter.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("builds a DOCX with real style parts", async () => {
    const file = await renderDocx(publication, { ...presetDefaults.manuscript, format: "DOCX" });
    const zip = await JSZip.loadAsync(file);
    const document = await zip.file("word/document.xml")?.async("string");
    const styles = await zip.file("word/styles.xml")?.async("string");
    expect(document).toContain("Departure");
    expect(document).toContain("Café");
    expect(styles).toContain("Heading1");
  });

  it("builds an EPUB 3 package that EPUBCheck accepts", async () => {
    const file = await renderEpub(publication, { ...presetDefaults.ebook, format: "EPUB" });
    const zip = await JSZip.loadAsync(file);
    expect(await zip.file("mimetype")?.async("string")).toBe("application/epub+zip");
    expect(await zip.file("OEBPS/nav.xhtml")?.async("string")).toContain("epub:type=\"toc\"");
    const report = await checkEpub(file);
    expect(report.ok, report.messages.join("\n")).toBe(true);
  });

  it("compiles a paginated PDF with Typst", async () => {
    const pdf = await compileTypst(publicationToTypst(publication, presetDefaults.paperback));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
