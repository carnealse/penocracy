import { json } from "@/lib/http";
import { archiveChapter, archiveScene } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json().catch(() => ({}));
    if (body.sceneId) {
      await archiveScene(userId, chapterId, body.sceneId);
      return json({ ok: true });
    }
    return json(await archiveChapter(userId, chapterId));
  });
}
