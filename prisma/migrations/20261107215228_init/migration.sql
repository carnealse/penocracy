-- CreateEnum
CREATE TYPE "PartKind" AS ENUM ('FRONT', 'BODY', 'BACK');

-- CreateEnum
CREATE TYPE "RevisionKind" AS ENUM ('AUTO', 'NAMED', 'MANUAL', 'PRE_RESTORE', 'PRE_IMPORT', 'PRE_ARCHIVE', 'PRE_REPLACE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ArchiveEntity" AS ENUM ('BOOK', 'PART', 'CHAPTER', 'SCENE');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'EPUB', 'DOCX');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preference" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortTitle" TEXT NOT NULL,
    "authorName" TEXT,
    "coverColor" TEXT NOT NULL DEFAULT '#6b4423',
    "coverObjectKey" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChapterId" TEXT,
    "lastCursor" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PartKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "partId" TEXT,
    "title" TEXT NOT NULL,
    "showHeading" BOOLEAN NOT NULL DEFAULT true,
    "numberMode" TEXT NOT NULL DEFAULT 'auto',
    "customNumber" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlob" (
    "hash" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentBlob_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT,
    "blobHash" TEXT NOT NULL,
    "parentHash" TEXT,
    "groupId" TEXT,
    "kind" "RevisionKind" NOT NULL,
    "label" TEXT,
    "wordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "entityType" "ArchiveEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bookTitle" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "originalParentId" TEXT,
    "previousSiblingId" TEXT,
    "nextSiblingId" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "preset" JSONB NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "artifactKey" TEXT,
    "validation" JSONB,
    "revisionCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredObject" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Book_userId_deletedAt_idx" ON "Book"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Book_userId_lastEditedAt_idx" ON "Book"("userId", "lastEditedAt");

-- CreateIndex
CREATE INDEX "Part_bookId_sortOrder_idx" ON "Part"("bookId", "sortOrder");

-- CreateIndex
CREATE INDEX "Chapter_bookId_archivedAt_sortOrder_idx" ON "Chapter"("bookId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "Chapter_partId_sortOrder_idx" ON "Chapter"("partId", "sortOrder");

-- CreateIndex
CREATE INDEX "Scene_chapterId_sortOrder_idx" ON "Scene"("chapterId", "sortOrder");

-- CreateIndex
CREATE INDEX "Revision_bookId_createdAt_idx" ON "Revision"("bookId", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_chapterId_createdAt_idx" ON "Revision"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "Revision_groupId_idx" ON "Revision"("groupId");

-- CreateIndex
CREATE INDEX "Comment_chapterId_idx" ON "Comment"("chapterId");

-- CreateIndex
CREATE INDEX "Bookmark_chapterId_idx" ON "Bookmark"("chapterId");

-- CreateIndex
CREATE INDEX "ArchiveRecord_userId_archivedAt_idx" ON "ArchiveRecord"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "ArchiveRecord_bookId_entityType_idx" ON "ArchiveRecord"("bookId", "entityType");

-- CreateIndex
CREATE INDEX "ExportPreset_userId_idx" ON "ExportPreset"("userId");

-- CreateIndex
CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportJob_status_idx" ON "ExportJob"("status");

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveRecord" ADD CONSTRAINT "ArchiveRecord_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportPreset" ADD CONSTRAINT "ExportPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
