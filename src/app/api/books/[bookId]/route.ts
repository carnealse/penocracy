import { json } from "@/lib/http";
import { archiveBook, getEditorBook, updateBook } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(_request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => json(await getEditorBook(userId, bookId)));
}

export async function PATCH(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    await updateBook(userId, bookId, body);
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    await archiveBook(userId, bookId);
    return json({ ok: true });
  });
}
