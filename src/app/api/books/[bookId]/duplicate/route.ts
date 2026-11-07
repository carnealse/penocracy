import { json } from "@/lib/http";
import { duplicateBook } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(_request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => json({ id: await duplicateBook(userId, bookId) }, 201));
}
