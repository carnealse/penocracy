import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/sha256";
import {
  diffParagraphs,
  docFromParagraphs,
  emptyDocument,
  hashDoc,
  insertionIndex,
  paragraphsOf,
  replaceInDoc,
  reviewDocument,
  wordCountDoc,
} from "@/lib/document";

describe("manuscript documents", () => {
  it("matches the SHA-256 test vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("counts words without treating the empty chapter as content", () => {
    expect(wordCountDoc(emptyDocument())).toBe(0);
  });

  it("replaces text and reports the count", () => {
    const doc = docFromParagraphs([{ kind: "paragraph", text: "The road road was long." }]);
    const replaced = replaceInDoc(doc, "road", "lane");
    expect(replaced.count).toBe(2);
    expect(paragraphsOf(replaced.doc)[0]?.text).toBe("The lane lane was long.");
  });

  it("diffs added and removed paragraphs", () => {
    const before = paragraphsOf(docFromParagraphs([{ kind: "paragraph", text: "One" }]));
    const after = paragraphsOf(docFromParagraphs([{ kind: "paragraph", text: "Two" }]));
    expect(diffParagraphs(before, after).map((row) => row.type)).toEqual(["removed", "added"]);
  });

  it("keeps a stable hash for the same document", () => {
    const doc = docFromParagraphs([{ kind: "paragraph", text: "Café — snow" }]);
    expect(hashDoc(doc)).toBe(hashDoc(structuredClone(doc)));
    expect(wordCountDoc(doc)).toBe(3);
  });

  it("flags a repeated word and leaves clean prose alone", () => {
    expect(reviewDocument(docFromParagraphs([{ kind: "paragraph", text: "the the road" }])).some((issue) => issue.rule === "repeated-word")).toBe(true);
    expect(reviewDocument(docFromParagraphs([{ kind: "paragraph", text: "The road was long." }]))).toEqual([]);
  });

  it("restores beside the surviving neighbor", () => {
    expect(insertionIndex(["a", "c"], "a", "b")).toBe(1);
    expect(insertionIndex(["c"], "missing", "c")).toBe(0);
    expect(insertionIndex(["a"], null, null)).toBe(1);
  });
});
