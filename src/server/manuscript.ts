import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";
import { ArchiveEntity, PartKind, RevisionKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  asDoc,
  countMatches,
  diffParagraphs,
  emptyDocument,
  extractScenes,
  hashDoc,
  insertionIndex,
  newId,
  paragraphsOf,
  previewText,
  replaceInDoc,
  wordCountDoc,
  type PMDoc,
} from "@/lib/document";
import { HttpError } from "@/lib/http";
import { chaptersToDocuments, type ImportChapter } from "@/lib/import-manuscript";
import { sortTitle } from "@/lib/shelf";
import { checkpointBook, checkpointChapter, readBlob, syncScenes } from "@/server/history";

const COVER_COLORS = ["#6b4423", "#1f3a5f", "#6e2b3a", "#2f4f3e", "#3d3a36", "#7a4e2d", "#24342c", "#4a3b63"];

function json(value: unknown): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

export async function ownedBookTitle(userId: string, bookId: string) {
  const book = await ownedBook(userId, bookId);
  return book.title;
}

async function ownedBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) throw new HttpError(404, "That book is not on your shelves.");
  return book;
}

export async function listBooks(userId: string) {
  const books = await prisma.book.findMany({
    where: { userId, deletedAt: null },
    orderBy: { title: "asc" },
    include: { chapters: { where: { archivedAt: null }, select: { wordCount: true } } },
  });
  return books.map((book) => ({
    id: book.id,
    title: book.title,
    authorName: book.authorName,
    coverColor: book.coverColor,
    coverObjectKey: book.coverObjectKey,
    pinned: book.pinned,
    lastEditedAt: book.lastEditedAt.toISOString(),
    wordCount: book.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
  }));
}

export async function createBook(userId: string, input: { title: string; authorName?: string | null; coverColor?: string }) {
  const title = input.title.trim();
  if (!title) throw new HttpError(400, "A book needs a title.");
  const doc = emptyDocument();
  const scene = extractScenes(doc)[0];
  return prisma.$transaction(async (tx) => {
    const book = await tx.book.create({
      data: {
        userId,
        title,
        sortTitle: sortTitle(title),
        authorName: input.authorName?.trim() || null,
        coverColor: input.coverColor || COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
        parts: {
          create: [
            { title: "Front matter", kind: PartKind.FRONT, sortOrder: 0 },
            { title: "Manuscript", kind: PartKind.BODY, sortOrder: 1 },
            { title: "Back matter", kind: PartKind.BACK, sortOrder: 2 },
          ],
        },
      },
      include: { parts: true },
    });
    const body = book.parts.find((part) => part.kind === PartKind.BODY);
    const chapter = await tx.chapter.create({
      data: {
        bookId: book.id,
        partId: body?.id,
        title: "Chapter 1",
        sortOrder: 0,
        content: json(doc),
        contentHash: hashDoc(doc),
        wordCount: 0,
        scenes: { create: [{ id: scene.id, title: scene.title, sortOrder: 0, wordCount: 0 }] },
      },
    });
    await tx.book.update({ where: { id: book.id }, data: { lastChapterId: chapter.id } });
    await checkpointChapter(tx, {
      bookId: book.id,
      chapterId: chapter.id,
      doc,
      kind: RevisionKind.MANUAL,
      label: "Created",
      groupId: newId(),
    });
    return book.id;
  });
}

export async function updateBook(
  userId: string,
  bookId: string,
  input: { title?: string; authorName?: string | null; pinned?: boolean; coverColor?: string; coverObjectKey?: string | null },
) {
  await ownedBook(userId, bookId);
  const title = input.title?.trim();
  return prisma.book.update({
    where: { id: bookId },
    data: {
      title: title || undefined,
      sortTitle: title ? sortTitle(title) : undefined,
      authorName: input.authorName === undefined ? undefined : input.authorName?.trim() || null,
      pinned: input.pinned,
      coverColor: input.coverColor,
      coverObjectKey: input.coverObjectKey,
      lastEditedAt: new Date(),
    },
  });
}

export async function duplicateBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId, deletedAt: null },
    include: { parts: { orderBy: { sortOrder: "asc" } }, chapters: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } },
  });
  if (!book) throw new HttpError(404, "That book is not on your shelves.");
  return prisma.$transaction(async (tx) => {
    const copy = await tx.book.create({
      data: {
        userId,
        title: `Copy of ${book.title}`,
        sortTitle: sortTitle(`Copy of ${book.title}`),
        authorName: book.authorName,
        coverColor: book.coverColor,
        pinned: false,
      },
    });
    const partMap = new Map<string, string>();
    for (const part of book.parts) {
      const created = await tx.part.create({
        data: { bookId: copy.id, title: part.title, kind: part.kind, sortOrder: part.sortOrder },
      });
      partMap.set(part.id, created.id);
    }
    let firstChapter: string | null = null;
    for (const chapter of book.chapters) {
      const created = await tx.chapter.create({
        data: {
          bookId: copy.id,
          partId: chapter.partId ? partMap.get(chapter.partId) : null,
          title: chapter.title,
          showHeading: chapter.showHeading,
          numberMode: chapter.numberMode,
          customNumber: chapter.customNumber,
          sortOrder: chapter.sortOrder,
          content: json(chapter.content),
          contentHash: chapter.contentHash,
          wordCount: chapter.wordCount,
        },
      });
      await syncScenes(tx, created.id, asDoc(chapter.content));
      firstChapter ??= created.id;
    }
    if (firstChapter) await tx.book.update({ where: { id: copy.id }, data: { lastChapterId: firstChapter } });
    return copy.id;
  });
}

export async function archiveBook(userId: string, bookId: string) {
  const book = await ownedBook(userId, bookId);
  if (book.deletedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.book.update({ where: { id: bookId }, data: { deletedAt: new Date() } });
    await tx.archiveRecord.create({
      data: {
        userId,
        bookId,
        entityType: ArchiveEntity.BOOK,
        entityId: bookId,
        title: book.title,
        bookTitle: book.title,
        location: "Library",
        preview: "",
        wordCount: 0,
        payload: json({ title: book.title }),
        contentUpdatedAt: book.updatedAt,
      },
    });
  });
}

export async function getEditorBook(userId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId, deletedAt: null },
    include: {
      parts: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, include: { chapters: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, include: { scenes: { orderBy: { sortOrder: "asc" } } } } } },
      chapters: { where: { archivedAt: null } },
    },
  });
  if (!book) throw new HttpError(404, "That book is not on your shelves.");
  const activeId = book.chapters.some((chapter) => chapter.id === book.lastChapterId)
    ? book.lastChapterId
    : book.chapters[0]?.id;
  const active = book.chapters.find((chapter) => chapter.id === activeId) ?? null;
  const preference = await prisma.preference.findUnique({ where: { userId } });
  const revisions = await prisma.revision.findMany({
    where: { bookId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return {
    id: book.id,
    title: book.title,
    authorName: book.authorName,
    lastCursor: book.lastCursor,
    parts: book.parts.map((part) => ({
      id: part.id,
      title: part.title,
      kind: part.kind,
      chapters: part.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        wordCount: chapter.wordCount,
        sortOrder: chapter.sortOrder,
        showHeading: chapter.showHeading,
        numberMode: chapter.numberMode,
        customNumber: chapter.customNumber,
        scenes: chapter.scenes.map((scene) => ({ id: scene.id, title: scene.title, wordCount: scene.wordCount })),
      })),
    })),
    activeChapter: active
      ? {
          id: active.id,
          title: active.title,
          content: active.content,
          revision: active.revision,
          wordCount: active.wordCount,
          hash: active.contentHash,
        }
      : null,
    totalWords: book.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    preferences: preference?.data ?? null,
    revisions: revisions.map((revision) => ({
      id: revision.id,
      chapterId: revision.chapterId,
      kind: revision.kind,
      label: revision.label,
      wordCount: revision.wordCount,
      groupId: revision.groupId,
      createdAt: revision.createdAt.toISOString(),
    })),
  };
}

export async function getChapter(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, archivedAt: null, book: { userId, deletedAt: null } },
  });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  return {
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    revision: chapter.revision,
    wordCount: chapter.wordCount,
    hash: chapter.contentHash,
    bookId: chapter.bookId,
  };
}

export type SaveResult =
  | { status: "saved"; revision: number; hash: string; wordCount: number }
  | { status: "conflict"; serverRevision: number; serverContent: unknown; serverHash: string };

export async function saveChapter(
  userId: string,
  chapterId: string,
  input: { baseRevision: number; content: unknown; cursor?: { from: number; to: number } | null; force?: boolean },
): Promise<SaveResult> {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, book: { userId, deletedAt: null } },
  });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  const doc = asDoc(input.content);
  const hash = hashDoc(doc);
  if (chapter.revision !== input.baseRevision && chapter.contentHash !== hash && !input.force) {
    return {
      status: "conflict",
      serverRevision: chapter.revision,
      serverContent: chapter.content,
      serverHash: chapter.contentHash,
    };
  }
  const words = wordCountDoc(doc);
  await prisma.$transaction(async (tx) => {
    if (input.force && chapter.contentHash !== hash) {
      await checkpointChapter(tx, {
        bookId: chapter.bookId,
        chapterId,
        doc: asDoc(chapter.content),
        kind: RevisionKind.CONFLICT,
        label: "Kept during conflict",
      });
    }
    await tx.chapter.update({
      where: { id: chapterId },
      data: {
        content: json(doc),
        contentHash: hash,
        wordCount: words,
        revision: chapter.contentHash === hash ? chapter.revision : chapter.revision + 1,
      },
    });
    await syncScenes(tx, chapterId, doc);
    await tx.book.update({
      where: { id: chapter.bookId },
      data: {
        lastEditedAt: new Date(),
        lastChapterId: chapterId,
        lastCursor: input.cursor ? json(input.cursor) : undefined,
      },
    });
  });
  const saved = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  return { status: "saved", revision: saved.revision, hash: saved.contentHash, wordCount: saved.wordCount };
}

export async function rememberCursor(userId: string, chapterId: string, cursor: { from: number; to: number }) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
  if (!chapter) return;
  await prisma.book.update({
    where: { id: chapter.bookId },
    data: { lastChapterId: chapterId, lastCursor: json(cursor) },
  });
}

export async function nameCheckpoint(userId: string, chapterId: string, label?: string) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  return prisma.$transaction((tx) =>
    checkpointChapter(tx, {
      bookId: chapter.bookId,
      chapterId,
      doc: asDoc(chapter.content),
      kind: label ? RevisionKind.NAMED : RevisionKind.MANUAL,
      label: label || "Checkpoint",
      groupId: newId(),
    }),
  );
}

export async function addChapter(userId: string, bookId: string, input: { partId?: string; title?: string; afterChapterId?: string }) {
  await ownedBook(userId, bookId);
  const parts = await prisma.part.findMany({ where: { bookId, deletedAt: null }, orderBy: { sortOrder: "asc" } });
  const part = parts.find((item) => item.id === input.partId) ?? parts.find((item) => item.kind === PartKind.BODY);
  if (!part) throw new HttpError(400, "The manuscript has no part to hold a chapter.");
  const siblings = await prisma.chapter.findMany({
    where: { bookId, partId: part.id, archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  let sortOrder = siblings.length;
  if (input.afterChapterId) {
    const index = siblings.findIndex((chapter) => chapter.id === input.afterChapterId);
    if (index >= 0) sortOrder = index + 1;
  }
  const doc = emptyDocument();
  const scene = extractScenes(doc)[0];
  return prisma.$transaction(async (tx) => {
    const shifted = siblings.filter((_, index) => index >= sortOrder);
    for (const chapter of shifted) {
      await tx.chapter.update({ where: { id: chapter.id }, data: { sortOrder: chapter.sortOrder + 1 } });
    }
    const created = await tx.chapter.create({
      data: {
        bookId,
        partId: part.id,
        title: input.title?.trim() || `Chapter ${siblings.length + 1}`,
        sortOrder,
        content: json(doc),
        contentHash: hashDoc(doc),
        scenes: { create: [{ id: scene.id, title: scene.title, sortOrder: 0, wordCount: 0 }] },
      },
    });
    await checkpointChapter(tx, { bookId, chapterId: created.id, doc, kind: RevisionKind.MANUAL, label: "Chapter created" });
    await tx.book.update({ where: { id: bookId }, data: { lastEditedAt: new Date(), lastChapterId: created.id } });
    return created.id;
  });
}

export async function updateChapterMeta(
  userId: string,
  chapterId: string,
  input: { title?: string; showHeading?: boolean; numberMode?: string; customNumber?: string | null },
) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      title: input.title?.trim() || undefined,
      showHeading: input.showHeading,
      numberMode: input.numberMode,
      customNumber: input.customNumber,
    },
  });
}

export async function duplicateChapter(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, archivedAt: null, book: { userId } } });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  const doc = asDoc(chapter.content);
  return prisma.$transaction(async (tx) => {
    const created = await tx.chapter.create({
      data: {
        bookId: chapter.bookId,
        partId: chapter.partId,
        title: `${chapter.title} copy`,
        showHeading: chapter.showHeading,
        numberMode: chapter.numberMode,
        customNumber: chapter.customNumber,
        sortOrder: chapter.sortOrder + 1,
        content: json(doc),
        contentHash: chapter.contentHash,
        wordCount: chapter.wordCount,
      },
    });
    await syncScenes(tx, created.id, doc);
    await tx.book.update({ where: { id: chapter.bookId }, data: { lastEditedAt: new Date() } });
    return created.id;
  });
}

export async function reorderChapters(userId: string, bookId: string, parts: Array<{ id: string; chapterIds: string[] }>) {
  await ownedBook(userId, bookId);
  await prisma.$transaction(async (tx) => {
    for (const part of parts) {
      for (const [index, chapterId] of part.chapterIds.entries()) {
        await tx.chapter.updateMany({
          where: { id: chapterId, bookId, archivedAt: null },
          data: { partId: part.id, sortOrder: index },
        });
      }
    }
    await tx.book.update({ where: { id: bookId }, data: { lastEditedAt: new Date() } });
  });
}

export async function archiveChapter(userId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, archivedAt: null, book: { userId, deletedAt: null } },
    include: { book: true, part: true },
  });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  const siblings = await prisma.chapter.findMany({
    where: { bookId: chapter.bookId, partId: chapter.partId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const index = siblings.findIndex((item) => item.id === chapterId);
  const doc = asDoc(chapter.content);
  const record = await prisma.$transaction(async (tx) => {
    await checkpointChapter(tx, {
      bookId: chapter.bookId,
      chapterId,
      doc,
      kind: RevisionKind.PRE_ARCHIVE,
      label: "Before archive",
    });
    await tx.chapter.update({ where: { id: chapterId }, data: { archivedAt: new Date() } });
    const created = await tx.archiveRecord.create({
      data: {
        userId,
        bookId: chapter.bookId,
        entityType: ArchiveEntity.CHAPTER,
        entityId: chapterId,
        title: chapter.title,
        bookTitle: chapter.book.title,
        location: chapter.part?.title || "Manuscript",
        preview: previewText(doc),
        wordCount: wordCountDoc(doc),
        payload: json({ content: doc, partId: chapter.partId, title: chapter.title }),
        originalParentId: chapter.partId,
        previousSiblingId: siblings[index - 1]?.id ?? null,
        nextSiblingId: siblings[index + 1]?.id ?? null,
        contentUpdatedAt: chapter.updatedAt,
      },
    });
    const remaining = await tx.chapter.count({ where: { bookId: chapter.bookId, archivedAt: null } });
    if (remaining === 0) {
      const docNext = emptyDocument();
      const scene = extractScenes(docNext)[0];
      const blank = await tx.chapter.create({
        data: {
          bookId: chapter.bookId,
          partId: chapter.partId,
          title: "Chapter 1",
          sortOrder: 0,
          content: json(docNext),
          contentHash: hashDoc(docNext),
          scenes: { create: [{ id: scene.id, title: scene.title, sortOrder: 0, wordCount: 0 }] },
        },
      });
      await tx.book.update({ where: { id: chapter.bookId }, data: { lastChapterId: blank.id, lastEditedAt: new Date() } });
    }
    return created;
  });
  return { archiveId: record.id };
}

export async function archiveScene(userId: string, chapterId: string, sceneId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, archivedAt: null, book: { userId } },
    include: { book: true },
  });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  const doc = asDoc(chapter.content);
  const scenes = (doc.content ?? []).filter((node) => node.type === "scene");
  const index = scenes.findIndex((scene) => scene.attrs?.id === sceneId);
  if (index < 0) throw new HttpError(404, "That scene is not in the chapter.");
  const removed = scenes[index];
  const remaining = scenes.filter((scene) => scene.attrs?.id !== sceneId);
  const nextDoc: PMDoc = {
    type: "doc",
    content: remaining.length > 0 ? remaining : [extractScenes(emptyDocument())[0].node],
  };
  await prisma.$transaction(async (tx) => {
    await checkpointChapter(tx, { bookId: chapter.bookId, chapterId, doc, kind: RevisionKind.PRE_ARCHIVE, label: "Before scene archive" });
    await tx.chapter.update({
      where: { id: chapterId },
      data: {
        content: json(nextDoc),
        contentHash: hashDoc(nextDoc),
        wordCount: wordCountDoc(nextDoc),
        revision: { increment: 1 },
      },
    });
    await syncScenes(tx, chapterId, nextDoc);
    await tx.archiveRecord.create({
      data: {
        userId,
        bookId: chapter.bookId,
        entityType: ArchiveEntity.SCENE,
        entityId: sceneId,
        title: String(removed.attrs?.title || "Scene"),
        bookTitle: chapter.book.title,
        location: chapter.title,
        preview: previewText({ type: "doc", content: removed.content ?? [] }),
        wordCount: wordCountDoc({ type: "doc", content: removed.content ?? [] }),
        payload: json({ node: removed, chapterId }),
        originalParentId: chapterId,
        previousSiblingId: scenes[index - 1] ? String(scenes[index - 1].attrs?.id) : null,
        nextSiblingId: scenes[index + 1] ? String(scenes[index + 1].attrs?.id) : null,
        contentUpdatedAt: chapter.updatedAt,
      },
    });
  });
}

export async function restoreArchive(userId: string, archiveId: string, target?: { partId?: string; chapterId?: string }) {
  const record = await prisma.archiveRecord.findFirst({ where: { id: archiveId, userId } });
  if (!record) throw new HttpError(404, "That archived item is gone.");
  if (record.entityType === ArchiveEntity.BOOK) {
    await prisma.book.update({ where: { id: record.entityId }, data: { deletedAt: null, lastEditedAt: new Date() } });
    return { bookId: record.entityId };
  }
  if (record.entityType === ArchiveEntity.CHAPTER) {
    const chapter = await prisma.chapter.findFirst({ where: { id: record.entityId, book: { userId } } });
    if (!chapter) throw new HttpError(404, "The archived chapter could not be found.");
    const partId = target?.partId || record.originalParentId || chapter.partId;
    const siblings = await prisma.chapter.findMany({
      where: { bookId: chapter.bookId, partId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    const index = insertionIndex(
      siblings.map((item) => item.id),
      record.previousSiblingId,
      record.nextSiblingId,
    );
    await prisma.$transaction(async (tx) => {
      for (const [siblingIndex, sibling] of siblings.entries()) {
        const sortOrder = siblingIndex >= index ? siblingIndex + 1 : siblingIndex;
        await tx.chapter.update({ where: { id: sibling.id }, data: { sortOrder } });
      }
      await tx.chapter.update({
        where: { id: chapter.id },
        data: { archivedAt: null, partId, sortOrder: index },
      });
      await tx.book.update({ where: { id: chapter.bookId }, data: { lastEditedAt: new Date(), deletedAt: null } });
    });
    return { bookId: chapter.bookId, chapterId: chapter.id };
  }
  if (record.entityType === ArchiveEntity.SCENE) {
    const payload = record.payload as { node?: PMDoc["content"][number]; chapterId?: string };
    const chapterId = target?.chapterId || payload.chapterId || record.originalParentId;
    if (!chapterId || !payload.node) throw new HttpError(400, "The scene cannot be restored without its chapter.");
    const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
    if (!chapter) throw new HttpError(404, "Choose a chapter that still exists.");
    const doc = asDoc(chapter.content);
    const scenes = (doc.content ?? []).filter((node) => node.type === "scene");
    const ids = scenes.map((scene) => String(scene.attrs?.id));
    const index = insertionIndex(ids, record.previousSiblingId, record.nextSiblingId);
    const nextScenes = scenes.slice();
    nextScenes.splice(index, 0, payload.node);
    const nextDoc: PMDoc = { type: "doc", content: nextScenes.length > 0 ? nextScenes : [payload.node] };
    await prisma.$transaction(async (tx) => {
      await checkpointChapter(tx, { bookId: chapter.bookId, chapterId, doc, kind: RevisionKind.PRE_RESTORE, label: "Before scene restore" });
      await tx.chapter.update({
        where: { id: chapterId },
        data: { content: json(nextDoc), contentHash: hashDoc(nextDoc), wordCount: wordCountDoc(nextDoc), revision: { increment: 1 } },
      });
      await syncScenes(tx, chapterId, nextDoc);
    });
    return { bookId: chapter.bookId, chapterId };
  }
  throw new HttpError(400, "That archive record cannot be restored.");
}

export async function listArchive(userId: string, bookId?: string) {
  const records = await prisma.archiveRecord.findMany({
    where: { userId, ...(bookId ? { bookId } : {}) },
    orderBy: { archivedAt: "desc" },
  });
  const books = await prisma.book.findMany({ where: { userId, deletedAt: { not: null } } });
  return {
    records: records.map((record) => ({
      id: record.id,
      entityType: record.entityType,
      entityId: record.entityId,
      title: record.title,
      bookId: record.bookId,
      bookTitle: record.bookTitle,
      location: record.location,
      preview: record.preview,
      wordCount: record.wordCount,
      archivedAt: record.archivedAt.toISOString(),
      contentUpdatedAt: record.contentUpdatedAt.toISOString(),
    })),
    books: books.map((book) => ({ id: book.id, title: book.title, deletedAt: book.deletedAt?.toISOString() ?? null })),
  };
}

export async function listRevisions(userId: string, bookId: string, chapterId?: string) {
  await ownedBook(userId, bookId);
  const revisions = await prisma.revision.findMany({
    where: { bookId, ...(chapterId ? { chapterId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return revisions.map((revision) => ({
    id: revision.id,
    chapterId: revision.chapterId,
    kind: revision.kind,
    label: revision.label,
    wordCount: revision.wordCount,
    groupId: revision.groupId,
    createdAt: revision.createdAt.toISOString(),
  }));
}

export async function revisionPreview(userId: string, revisionId: string) {
  const revision = await prisma.revision.findFirst({ where: { id: revisionId, book: { userId } } });
  if (!revision) throw new HttpError(404, "That revision is not available.");
  const doc = await readBlob(revision.blobHash);
  return { doc, createdAt: revision.createdAt.toISOString(), label: revision.label, wordCount: revision.wordCount };
}

export async function compareRevisions(userId: string, leftId: string, rightId: string) {
  const [left, right] = await Promise.all([
    prisma.revision.findFirst({ where: { id: leftId, book: { userId } } }),
    prisma.revision.findFirst({ where: { id: rightId, book: { userId } } }),
  ]);
  if (!left || !right) throw new HttpError(404, "Choose two revisions from your manuscript.");
  const [before, after] = await Promise.all([readBlob(left.blobHash), readBlob(right.blobHash)]);
  return {
    rows: diffParagraphs(paragraphsOf(before), paragraphsOf(after)),
    left: { id: left.id, createdAt: left.createdAt.toISOString(), label: left.label },
    right: { id: right.id, createdAt: right.createdAt.toISOString(), label: right.label },
  };
}

export async function restoreRevision(userId: string, revisionId: string) {
  const revision = await prisma.revision.findFirst({ where: { id: revisionId, book: { userId } } });
  if (!revision?.chapterId) throw new HttpError(400, "Restore a chapter revision, or restore the whole group from Archive.");
  const chapter = await prisma.chapter.findUnique({ where: { id: revision.chapterId } });
  if (!chapter) throw new HttpError(404, "The chapter for that revision no longer exists.");
  const doc = await readBlob(revision.blobHash);
  await prisma.$transaction(async (tx) => {
    await checkpointChapter(tx, {
      bookId: chapter.bookId,
      chapterId: chapter.id,
      doc: asDoc(chapter.content),
      kind: RevisionKind.PRE_RESTORE,
      label: "Before restore",
    });
    await tx.chapter.update({
      where: { id: chapter.id },
      data: {
        content: json(doc),
        contentHash: hashDoc(doc),
        wordCount: wordCountDoc(doc),
        revision: { increment: 1 },
        archivedAt: null,
      },
    });
    await syncScenes(tx, chapter.id, doc);
    await checkpointChapter(tx, {
      bookId: chapter.bookId,
      chapterId: chapter.id,
      doc,
      kind: RevisionKind.MANUAL,
      label: "Restored",
    });
  });
  return { bookId: chapter.bookId, chapterId: chapter.id };
}

export async function importChapters(userId: string, input: { bookId?: string; title?: string; authorName?: string; chapters: ImportChapter[] }) {
  const documents = chaptersToDocuments(input.chapters);
  if (documents.length === 0) throw new HttpError(400, "Nothing in that file could become a chapter.");
  if (!input.bookId) {
    const bookId = await createBook(userId, { title: input.title || documents[0].title, authorName: input.authorName });
    await replaceChapters(userId, bookId, documents);
    return bookId;
  }
  await ownedBook(userId, input.bookId);
  await prisma.$transaction(async (tx) => {
    await checkpointBook(tx, input.bookId!, RevisionKind.PRE_IMPORT, "Before import");
  });
  const part = await prisma.part.findFirst({ where: { bookId: input.bookId, kind: PartKind.BODY, deletedAt: null } });
  const existing = await prisma.chapter.count({ where: { bookId: input.bookId, archivedAt: null } });
  await prisma.$transaction(async (tx) => {
    for (const [index, document] of documents.entries()) {
      const scene = extractScenes(document.doc)[0];
      const chapter = await tx.chapter.create({
        data: {
          bookId: input.bookId!,
          partId: part?.id,
          title: document.title,
          sortOrder: existing + index,
          content: json(document.doc),
          contentHash: hashDoc(document.doc),
          wordCount: document.wordCount,
          scenes: scene ? { create: [{ id: scene.id, title: scene.title, sortOrder: 0, wordCount: scene.wordCount }] } : undefined,
        },
      });
      await checkpointChapter(tx, {
        bookId: input.bookId!,
        chapterId: chapter.id,
        doc: document.doc,
        kind: RevisionKind.MANUAL,
        label: "Imported",
      });
    }
    await tx.book.update({ where: { id: input.bookId! }, data: { lastEditedAt: new Date() } });
  });
  return input.bookId;
}

async function replaceChapters(userId: string, bookId: string, documents: ReturnType<typeof chaptersToDocuments>) {
  const first = await prisma.chapter.findFirst({ where: { bookId, archivedAt: null }, orderBy: { sortOrder: "asc" } });
  if (!first) return;
  const [firstDoc, ...rest] = documents;
  const part = await prisma.part.findFirst({ where: { bookId, kind: PartKind.BODY } });
  await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: first.id },
      data: {
        title: firstDoc.title,
        content: json(firstDoc.doc),
        contentHash: hashDoc(firstDoc.doc),
        wordCount: firstDoc.wordCount,
        revision: { increment: 1 },
      },
    });
    await syncScenes(tx, first.id, firstDoc.doc);
    for (const [index, document] of rest.entries()) {
      const scene = extractScenes(document.doc)[0];
      await tx.chapter.create({
        data: {
          bookId,
          partId: part?.id,
          title: document.title,
          sortOrder: index + 1,
          content: json(document.doc),
          contentHash: hashDoc(document.doc),
          wordCount: document.wordCount,
          scenes: scene ? { create: [{ id: scene.id, title: scene.title, sortOrder: 0, wordCount: scene.wordCount }] } : undefined,
        },
      });
    }
    await tx.book.update({ where: { id: bookId }, data: { lastEditedAt: new Date(), lastChapterId: first.id } });
  });
}

export async function replaceInBook(
  userId: string,
  bookId: string,
  input: { query: string; replacement: string; chapterId?: string; caseSensitive?: boolean },
) {
  await ownedBook(userId, bookId);
  const chapters = await prisma.chapter.findMany({
    where: { bookId, archivedAt: null, ...(input.chapterId ? { id: input.chapterId } : {}) },
  });
  let total = 0;
  await prisma.$transaction(async (tx) => {
    await checkpointBook(tx, bookId, RevisionKind.PRE_REPLACE, "Before replace");
    for (const chapter of chapters) {
      const result = replaceInDoc(asDoc(chapter.content), input.query, input.replacement, { caseSensitive: input.caseSensitive });
      total += result.count;
      if (result.count === 0) continue;
      await tx.chapter.update({
        where: { id: chapter.id },
        data: {
          content: json(result.doc),
          contentHash: hashDoc(result.doc),
          wordCount: wordCountDoc(result.doc),
          revision: { increment: 1 },
        },
      });
      await syncScenes(tx, chapter.id, result.doc);
    }
  });
  return { count: total };
}

export async function countInBook(userId: string, bookId: string, query: string, chapterId?: string, caseSensitive?: boolean) {
  await ownedBook(userId, bookId);
  const chapters = await prisma.chapter.findMany({
    where: { bookId, archivedAt: null, ...(chapterId ? { id: chapterId } : {}) },
  });
  return chapters.reduce((sum, chapter) => sum + countMatches(asDoc(chapter.content), query, { caseSensitive }), 0);
}

export async function addComment(userId: string, chapterId: string, input: { id: string; body: string }) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  return prisma.comment.upsert({
    where: { id: input.id },
    create: { id: input.id, bookId: chapter.bookId, chapterId, body: input.body },
    update: { body: input.body },
  });
}

export async function listComments(userId: string, bookId: string) {
  await ownedBook(userId, bookId);
  return prisma.comment.findMany({ where: { bookId }, orderBy: { createdAt: "desc" } });
}

export async function addBookmark(userId: string, chapterId: string, input: { id: string; label: string }) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, book: { userId } } });
  if (!chapter) throw new HttpError(404, "That chapter is not in the manuscript.");
  return prisma.bookmark.upsert({
    where: { id: input.id },
    create: { id: input.id, bookId: chapter.bookId, chapterId, label: input.label },
    update: { label: input.label },
  });
}

export async function listBookmarks(userId: string, bookId: string) {
  await ownedBook(userId, bookId);
  return prisma.bookmark.findMany({ where: { bookId }, orderBy: { createdAt: "desc" } });
}

export const coverPalette = COVER_COLORS;
