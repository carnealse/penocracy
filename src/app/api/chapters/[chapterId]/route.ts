import { json } from "@/lib/http";
import { destroyChapter, getChapter, saveChapter, updateChapterMeta } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => json(await getChapter(userId, chapterId)));
}

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    if (body.content) {
      const result = await saveChapter(userId, chapterId, body);
      return json(result, result.status === "conflict" ? 409 : 200);
    }
    await updateChapterMeta(userId, chapterId, body);
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => {
    await destroyChapter(userId, chapterId);
    return json({ ok: true });
  });
}
