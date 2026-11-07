import {
  AlignmentType,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
  UnderlineType,
  type IParagraphOptions,
} from "docx";
import type { Block, Inline, Publication } from "@/lib/publication";
import { trimInches, type ExportOptions } from "@/lib/export-options";

export async function renderDocx(publication: Publication, options: ExportOptions): Promise<Buffer> {
  const trim = trimInches(options);
  const font = options.font === "mono" ? "Courier Prime" : "Times New Roman";
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let footnoteId = 1;
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: publication.title, bold: true, font, size: options.fontSize * 4 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: publication.author, italics: true, font, size: options.fontSize * 2 })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Contents", font })],
    }),
    ...publication.chapters
      .filter((chapter) => chapter.showHeading)
      .map(
        (chapter) =>
          new Paragraph({
            children: [
              new TextRun({
                text: chapter.number ? `Chapter ${chapter.number}. ${chapter.title}` : chapter.title,
                font,
              }),
            ],
          }),
      ),
  ];
  for (const chapter of publication.chapters) {
    if (chapter.showHeading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          spacing: { before: 360, after: 240 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: chapter.number ? `Chapter ${chapter.number}. ${chapter.title}` : chapter.title,
              font,
            }),
          ],
        }),
      );
    }
    for (const block of chapter.blocks) {
      children.push(...blockToParagraphs(block, options, font, footnotes, () => footnoteId++));
    }
  }
  const margin = Math.round(options.marginIn * 1440);
  const gutter = Math.round(options.gutterIn * 1440);
  const doc = new Document({
    title: publication.title,
    creator: publication.author,
    description: `Exported from the revision saved ${publication.revisionCreatedAt}. Word pagination can differ from this file's preview.`,
    styles: {
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 },
          run: { bold: true, font, size: options.fontSize * 2 + 8 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
          run: { bold: true, font, size: options.fontSize * 2 + 4 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "penocracy-numbers",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    footnotes,
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(trim.width * 1440), height: Math.round(trim.height * 1440) },
            margin: {
              top: margin,
              bottom: margin,
              left: margin + (options.mirrored ? 0 : gutter),
              right: margin,
              gutter: options.mirrored ? gutter : 0,
            },
          },
        },
        headers: options.header
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: publication.author, font, size: 18 }),
                      new TextRun({ text: "  ·  ", font, size: 18 }),
                      new TextRun({ text: publication.title, italics: true, font, size: 18 }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: options.pageNumbers
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ children: [PageNumber.CURRENT], font, size: 18 })],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function lineSpacing(options: ExportOptions) {
  return {
    line: Math.round(options.lineHeight * 240),
    lineRule: "auto" as const,
    after: options.indent ? 0 : 160,
  };
}

function blockToParagraphs(
  block: Block,
  options: ExportOptions,
  font: string,
  footnotes: Record<number, { children: Paragraph[] }>,
  nextId: () => number,
): Paragraph[] {
  if (block.type === "paragraph") {
    return [paragraph(inlinesToRuns(block.inlines, font, footnotes, nextId), options, font, alignment(block.align))];
  }
  if (block.type === "heading") {
    return [
      new Paragraph({
        heading: block.level <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        children: inlinesToRuns(block.inlines, font, footnotes, nextId),
      }),
    ];
  }
  if (block.type === "blockquote") {
    return block.blocks.flatMap((child) =>
      blockToParagraphs(child, options, font, footnotes, nextId).map(
        () =>
          new Paragraph({
            indent: { left: 720 },
            children: child.type === "paragraph" ? inlinesToRuns(child.inlines, font, footnotes, nextId) : [new TextRun({ text: "", font })],
          }),
      ),
    );
  }
  if (block.type === "list") {
    return block.items.map(
      (item, index) =>
        new Paragraph({
          numbering: block.ordered ? { reference: "penocracy-numbers", level: 0 } : undefined,
          children: [
            ...(block.ordered ? [] : [new TextRun({ text: "• ", font })]),
            ...inlinesToRuns(item, font, footnotes, nextId),
          ],
          spacing: lineSpacing(options),
          ...(index === 0 ? {} : {}),
        }),
    );
  }
  if (block.type === "sceneBreak") {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [new TextRun({ text: "* * *", font })],
      }),
    ];
  }
  if (block.type === "sceneTitle") {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: block.text, italics: true, font })],
      }),
    ];
  }
  if (block.type === "rule") {
    return [new Paragraph({ children: [new PageBreak()] })];
  }
  return [];
}

function paragraph(children: TextRun[], options: ExportOptions, font: string, align?: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph {
  const config: IParagraphOptions = {
    style: "Normal",
    spacing: lineSpacing(options),
    indent: options.indent ? { firstLine: 720 } : undefined,
    alignment: align ?? (options.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT),
    children: children.length > 0 ? children : [new TextRun({ text: "", font })],
  };
  return new Paragraph(config);
}

function inlinesToRuns(
  inlines: Inline[],
  font: string,
  footnotes: Record<number, { children: Paragraph[] }>,
  nextId: () => number,
): TextRun[] {
  const runs: TextRun[] = [];
  for (const inline of inlines) {
    if (inline.type === "break") {
      runs.push(new TextRun({ break: 1, font }));
      continue;
    }
    if (inline.type === "footnote") {
      const id = nextId();
      footnotes[id] = { children: [new Paragraph({ children: [new TextRun({ text: inline.text, font })] })] };
      runs.push(new FootnoteReferenceRun(id));
      continue;
    }
    runs.push(
      new TextRun({
        text: inline.text,
        font,
        bold: inline.marks.includes("bold"),
        italics: inline.marks.includes("italic"),
        underline: inline.marks.includes("underline") ? { type: UnderlineType.SINGLE } : undefined,
        strike: inline.marks.includes("strike"),
        superScript: inline.marks.includes("superscript"),
        subScript: inline.marks.includes("subscript"),
        style: inline.href ? "Hyperlink" : undefined,
      }),
    );
  }
  return runs;
}

function alignment(value?: string) {
  if (value === "center") return AlignmentType.CENTER;
  if (value === "right") return AlignmentType.RIGHT;
  if (value === "justify") return AlignmentType.JUSTIFIED;
  return undefined;
}
