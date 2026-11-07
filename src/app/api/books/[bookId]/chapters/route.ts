import { json } from "@/lib/http";
import { addChapter } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json().catch(() => ({}));
    const id = await addChapter(userId, bookId, body);
    return json({ id }, 201);
  });
}
