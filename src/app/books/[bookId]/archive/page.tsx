import { notFound, redirect } from "next/navigation";
import { ArchiveView } from "@/components/archive/archive-view";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { listArchive, listRevisions, ownedBookTitle } from "@/server/manuscript";

export const dynamic = "force-dynamic";

export default async function ArchivePage({ params }: { params: Promise<{ bookId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { bookId } = await params;
  try {
    const title = await ownedBookTitle(session.user.id, bookId);
    const archive = await listArchive(session.user.id, bookId);
    const revisions = await listRevisions(session.user.id, bookId);
    return <ArchiveView bookId={bookId} title={title} records={archive.records} revisions={revisions} />;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
