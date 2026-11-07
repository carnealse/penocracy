import { notFound, redirect } from "next/navigation";
import { ExportView } from "@/components/export/export-view";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getEditorBook } from "@/server/manuscript";

export const dynamic = "force-dynamic";

export default async function ExportPage({ params }: { params: Promise<{ bookId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { bookId } = await params;
  try {
    const book = await getEditorBook(session.user.id, bookId);
    const chapters = book.parts.flatMap((part) => part.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })));
    return <ExportView bookId={book.id} title={book.title} chapters={chapters} />;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
