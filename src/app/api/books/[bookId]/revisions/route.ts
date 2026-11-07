import { json } from "@/lib/http";
import { listRevisions } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  const chapterId = new URL(request.url).searchParams.get("chapterId") ?? undefined;
  return guard(async (userId) => json(await listRevisions(userId, bookId, chapterId)));
}
