import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { asDoc, wordCountText } from "@/lib/document";
import { registerUser } from "@/server/accounts";
import { archiveChapter, createBook, restoreArchive, restoreRevision, saveChapter } from "@/server/manuscript";
import { readBlob } from "@/server/history";

describe("manuscript recovery", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.contentBlob.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("archives a chapter, restores it, and keeps the newer text when rolling back", async () => {
    const user = await registerUser({ email: "ada@example.com", password: "longpassword", name: "Ada" });
    const bookId = await createBook(user.id, { title: "The Amber Road", authorName: "Ada Quinn" });
    const original = await prisma.chapter.findFirstOrThrow({ where: { bookId, archivedAt: null } });
    const saved = await saveChapter(user.id, original.id, {
      baseRevision: original.revision,
      content: {
        type: "doc",
        content: [{ type: "scene", attrs: { id: "s1", title: "Scene 1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "The first road." }] }] }],
      },
    });
    expect(saved.status).toBe("saved");
    const archived = await archiveChapter(user.id, original.id);
    expect(await prisma.chapter.findUnique({ where: { id: original.id } })).toMatchObject({ archivedAt: expect.any(Date) });
    await restoreArchive(user.id, archived.archiveId);
    const restored = await prisma.chapter.findUniqueOrThrow({ where: { id: original.id } });
    expect(restored.archivedAt).toBeNull();
    expect(asDoc(restored.content).content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("The first road.");

    const before = await prisma.revision.findFirstOrThrow({ where: { chapterId: original.id, label: "Before archive" } });
    await saveChapter(user.id, original.id, {
      baseRevision: restored.revision,
      content: {
        type: "doc",
        content: [{ type: "scene", attrs: { id: "s1", title: "Scene 1" }, content: [{ type: "paragraph", content: [{ type: "text", text: "A later sentence." }] }] }],
      },
    });
    await restoreRevision(user.id, before.id);
    const current = await prisma.chapter.findUniqueOrThrow({ where: { id: original.id } });
    const kept = await prisma.revision.findFirst({ where: { chapterId: original.id, label: "Before restore" }, orderBy: { createdAt: "desc" } });
    expect(kept).toBeTruthy();
    const keptDoc = await readBlob(kept!.blobHash);
    expect(JSON.stringify(keptDoc)).toContain("A later sentence.");
    expect(JSON.stringify(current.content)).toContain("The first road.");
    expect(wordCountText("A later sentence.")).toBe(3);
  });

  it("refuses to overwrite a newer chapter revision", async () => {
    const user = await registerUser({ email: "bea@example.com", password: "longpassword", name: "Bea" });
    const bookId = await createBook(user.id, { title: "Harbor" });
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { bookId } });
    const first = await saveChapter(user.id, chapter.id, {
      baseRevision: chapter.revision,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Server copy." }] }] },
    });
    expect(first.status).toBe("saved");
    if (first.status !== "saved") return;
    const conflict = await saveChapter(user.id, chapter.id, {
      baseRevision: chapter.revision,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Local copy." }] }] },
    });
    expect(conflict.status).toBe("conflict");
    const stored = await prisma.chapter.findUniqueOrThrow({ where: { id: chapter.id } });
    expect(JSON.stringify(stored.content)).toContain("Server copy.");
  });
});
