import { ExportFormat, ExportStatus, PartKind, RevisionKind } from "@/generated/prisma/enums";
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/db";
import { resolveExportOptions, type ExportOptions } from "@/lib/export-options";
import { HttpError } from "@/lib/http";
import { asDoc } from "@/lib/document";
import { toPublication, type ChapterSource } from "@/lib/publication";
import { renderDocx } from "@/lib/render-docx";
import { checkEpub, renderEpub } from "@/lib/render-epub";
import { compileTypst, publicationToTypst } from "@/lib/render-typst";
import { checkpointBook } from "@/server/history";
import { put } from "@vercel/blob";

function json(value: unknown): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

export async function enqueueExport(userId: string, bookId: string, input: unknown) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId, deletedAt: null } });
  if (!book) throw new HttpError(404, "That book is not on your shelves.");
  const options = resolveExportOptions(input);
  const groupId = await prisma.$transaction((tx) => checkpointBook(tx, bookId, RevisionKind.AUTO, "Export snapshot"));
  const stamp = new Date();
  const job = await prisma.exportJob.create({
    data: {
      userId,
      bookId,
      groupId,
      format: options.format,
      preset: json(options),
      status: ExportStatus.QUEUED,
      revisionCreatedAt: stamp,
    },
  });
  if (process.env.EXPORT_MODE !== "worker") {
    void processExportJob(job.id);
  }
  return job;
}

export async function processExportJob(jobId: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === ExportStatus.READY) return;
  await prisma.exportJob.update({ where: { id: jobId }, data: { status: ExportStatus.RUNNING, error: null } });
  try {
    const options = resolveExportOptions(job.preset);
    const format = job.format;
    const publication = await publicationFromGroup(job.bookId, job.groupId, job.revisionCreatedAt.toISOString(), options);
    let bytes: Buffer;
    let contentType: string;
    let extension: string;
    let validation: unknown = null;
    if (format === ExportFormat.PDF) {
      bytes = await compileTypst(publicationToTypst(publication, options));
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Typst did not produce a PDF.");
      contentType = "application/pdf";
      extension = "pdf";
    } else if (format === ExportFormat.EPUB) {
      bytes = await renderEpub(publication, options);
      const report = await checkEpub(bytes);
      validation = report;
      if (!report.ok) throw new Error(report.messages.slice(0, 8).join("\n") || "EPUBCheck rejected the file.");
      contentType = "application/epub+zip";
      extension = "epub";
    } else {
      bytes = await renderDocx(publication, options);
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      extension = "docx";
    }
    const fileName = `${publication.title.replace(/[^\w.-]+/g, "-")}.${extension}`;
    const key = await storeArtifact(job.userId, fileName, contentType, bytes);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: ExportStatus.READY, artifactKey: key, validation: validation ? json(validation) : undefined, finishedAt: new Date() },
    });
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: ExportStatus.FAILED,
        error: error instanceof Error ? error.message : "Export failed.",
        finishedAt: new Date(),
      },
    });
  }
}

async function publicationFromGroup(bookId: string, groupId: string, revisionCreatedAt: string, options: ExportOptions) {
  const book = await prisma.book.findUniqueOrThrow({ where: { id: bookId } });
  const revisions = await prisma.revision.findMany({ where: { bookId, groupId } });
  const chapters = await prisma.chapter.findMany({
    where: { bookId },
    include: { part: true },
  });
  const byId = new Map(revisions.map((revision) => [revision.chapterId, revision]));
  const sources: ChapterSource[] = [];
  for (const chapter of chapters) {
    if (chapter.archivedAt && !byId.has(chapter.id)) continue;
    const revision = byId.get(chapter.id);
    const blob = revision ? await prisma.contentBlob.findUnique({ where: { hash: revision.blobHash } }) : null;
    const content = blob ? asDoc(JSON.parse(Buffer.from(blob.data).toString("utf8"))) : asDoc(chapter.content);
    sources.push({
      id: chapter.id,
      title: chapter.title,
      kind: chapter.part?.kind ?? PartKind.BODY,
      showHeading: chapter.showHeading,
      numberMode: chapter.numberMode,
      customNumber: chapter.customNumber,
      sortOrder: chapter.sortOrder,
      partOrder: chapter.part?.sortOrder ?? 1,
      content,
      wordCount: chapter.wordCount,
    });
  }
  return toPublication(
    { title: book.title, authorName: book.authorName },
    sources,
    { revisionCreatedAt, groupId },
    { includeFront: options.includeFront, includeBack: options.includeBack, numbering: options.numbering, chapterIds: options.chapterIds },
  );
}

async function storeArtifact(userId: string, fileName: string, contentType: string, data: Buffer) {
  const key = `exports/${userId}/${crypto.randomUUID()}-${fileName}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, data, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType,
    });
    await prisma.storedObject.create({
      data: { key, userId, contentType, fileName, data: bytesOf(Buffer.from(blob.url)) },
    });
    return key;
  }
  await prisma.storedObject.create({ data: { key, userId, contentType, fileName, data: bytesOf(data) } });
  return key;
}

function bytesOf(data: Buffer): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export async function readArtifact(userId: string, key: string) {
  const object = await prisma.storedObject.findFirst({ where: { key, userId } });
  if (!object) throw new HttpError(404, "That file is not available.");
  const storedText = new TextDecoder().decode(object.data);
  if (process.env.BLOB_READ_WRITE_TOKEN && object.data.byteLength < 500 && storedText.startsWith("http")) {
    const response = await fetch(storedText);
    if (!response.ok) throw new HttpError(502, "The stored export could not be read.");
    return { fileName: object.fileName, contentType: object.contentType, data: Buffer.from(await response.arrayBuffer()) };
  }
  return { fileName: object.fileName, contentType: object.contentType, data: Buffer.from(object.data) };
}

export async function claimQueuedJobs() {
  const jobs = await prisma.exportJob.findMany({ where: { status: ExportStatus.QUEUED }, take: 5, orderBy: { createdAt: "asc" } });
  for (const job of jobs) await processExportJob(job.id);
}
