import { describe, expect, it } from "vitest";
import { blocksFromDoc, type Block } from "@/lib/publication";
import type { PMDoc, PMNode } from "@/lib/document";

function paragraph(text: string): PMNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function chapter(content: PMNode[]): PMDoc {
  return { type: "doc", content: [{ type: "scene", attrs: { id: "s", title: "" }, content }] };
}

function flags(blocks: Block[]) {
  return blocks.map((block) => {
    if (block.type === "paragraph") return `${block.blank ? "blank" : block.indent ? "indent" : "flush"}:${block.inlines.map((inline) => inline.type === "text" ? inline.text : "").join("")}`;
    return block.type;
  });
}

describe("novel paragraph layout", () => {
  it("indents every paragraph after the first and keeps a blank line from removing that indent", () => {
    const blocks = blocksFromDoc(chapter([
      paragraph("First"),
      paragraph("Second"),
      paragraph(""),
      paragraph("After blank"),
    ]));
    expect(flags(blocks)).toEqual(["flush:First", "indent:Second", "blank:", "indent:After blank"]);
  });

  it("removes indent only for the paragraph that follows an explicit scene break", () => {
    const blocks = blocksFromDoc(chapter([
      paragraph("Opening"),
      { type: "sceneBreak" },
      paragraph("After scene"),
      paragraph(""),
      paragraph("Still indented"),
    ]));
    expect(flags(blocks)).toEqual(["flush:Opening", "sceneBreak", "flush:After scene", "blank:", "indent:Still indented"]);
  });
});
