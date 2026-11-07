import { json } from "@/lib/http";
import { duplicateChapter } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => json({ id: await duplicateChapter(userId, chapterId) }, 201));
}
