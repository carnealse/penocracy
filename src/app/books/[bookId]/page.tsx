import { notFound, redirect } from "next/navigation";
import { EditorShell } from "@/components/editor/editor-shell";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { getEditorBook } from "@/server/manuscript";

export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ bookId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { bookId } = await params;
  try {
    const book = await getEditorBook(session.user.id, bookId);
    return <EditorShell initial={book} />;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
