import { describe, expect, it } from "vitest";
import { compareTitles, organizeLibrary, sortTitle } from "@/lib/shelf";

describe("library shelves", () => {
  const books = [
    { id: "the", title: "The Amber Road", pinned: true, lastEditedAt: "2026-01-01" },
    { id: "a", title: "A Quiet Harbor", pinned: true, lastEditedAt: "2026-02-01" },
    { id: "recent", title: "North Wind", pinned: false, lastEditedAt: "2026-03-01" },
    { id: "old", title: "An Old Lantern", pinned: false, lastEditedAt: "2026-01-15" },
  ];

  it("ignores leading articles when sorting", () => {
    expect(sortTitle("The Amber Road")).toBe("Amber Road");
    expect(compareTitles("The Amber Road", "A Quiet Harbor")).toBeLessThan(0);
  });

  it("puts pinned books first and the latest edit once", () => {
    const shelves = organizeLibrary(books);
    expect(shelves.top.map((book) => book.id)).toEqual(["the", "a", "recent"]);
    expect(shelves.top.find((book) => book.id === "recent")?.recent).toBe(true);
    expect(shelves.rest.map((book) => book.id)).toEqual(["old"]);
  });

  it("does not duplicate a pinned book that was edited last", () => {
    const shelves = organizeLibrary(books.map((book) => book.id === "a" ? { ...book, lastEditedAt: "2026-04-01" } : book));
    const ids = [...shelves.top, ...shelves.rest].map((book) => book.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(shelves.top.some((book) => book.recent)).toBe(false);
  });
});
