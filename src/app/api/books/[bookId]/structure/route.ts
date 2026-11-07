import { json } from "@/lib/http";
import { reorderChapters } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    await reorderChapters(userId, bookId, body.parts ?? []);
    return json({ ok: true });
  });
}
