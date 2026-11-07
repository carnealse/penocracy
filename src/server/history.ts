import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { RevisionKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  asDoc,
  commentIds,
  extractScenes,
  hashDoc,
  previewText,
  stableStringify,
  wordCountDoc,
  type PMDoc,
} from "@/lib/document";

type Tx = TransactionClient;

export async function storeBlob(tx: Tx, doc: PMDoc) {
  const encoded = Buffer.from(stableStringify(doc));
  const hash = hashDoc(doc);
  await tx.contentBlob.upsert({
    where: { hash },
    create: { hash, data: encoded, byteSize: encoded.byteLength },
    update: {},
  });
  return { hash, wordCount: wordCountDoc(doc) };
}

export async function readBlob(hash: string): Promise<PMDoc> {
  const blob = await prisma.contentBlob.findUnique({ where: { hash } });
  if (!blob) throw new Error("A revision blob is missing.");
  return asDoc(JSON.parse(Buffer.from(blob.data).toString("utf8")));
}

export async function checkpointChapter(
  tx: Tx,
  input: {
    bookId: string;
    chapterId: string;
    doc: PMDoc;
    kind: RevisionKind;
    label?: string | null;
    groupId?: string | null;
  },
) {
  const previous = await tx.revision.findFirst({
    where: { chapterId: input.chapterId },
    orderBy: { createdAt: "desc" },
  });
  const stored = await storeBlob(tx, input.doc);
  if (previous && previous.blobHash === stored.hash && input.kind === "AUTO" && !input.label) {
    return previous;
  }
  return tx.revision.create({
    data: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      blobHash: stored.hash,
      parentHash: previous?.blobHash ?? null,
      groupId: input.groupId ?? null,
      kind: input.kind,
      label: input.label ?? null,
      wordCount: stored.wordCount,
    },
  });
}

export async function checkpointBook(
  tx: Tx,
  bookId: string,
  kind: RevisionKind,
  label: string,
) {
  const groupId = crypto.randomUUID();
  const chapters = await tx.chapter.findMany({
    where: { bookId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  for (const chapter of chapters) {
    await checkpointChapter(tx, {
      bookId,
      chapterId: chapter.id,
      doc: asDoc(chapter.content),
      kind,
      label,
      groupId,
    });
  }
  return groupId;
}

export async function syncScenes(tx: Tx, chapterId: string, doc: PMDoc) {
  const scenes = extractScenes(doc).filter((scene) => scene.node.type === "scene");
  await tx.scene.deleteMany({ where: { chapterId } });
  if (scenes.length === 0) return;
  await tx.scene.createMany({
    data: scenes.map((scene) => ({
      id: scene.id,
      chapterId,
      title: scene.title,
      sortOrder: scene.sortOrder,
      wordCount: scene.wordCount,
    })),
  });
}

export async function syncComments(tx: Tx, bookId: string, chapterId: string, doc: PMDoc) {
  const ids = commentIds(doc);
  if (ids.length === 0) return;
  await tx.comment.deleteMany({ where: { chapterId, id: { notIn: ids } } });
}

export function chapterPreview(doc: PMDoc) {
  return previewText(doc);
}
