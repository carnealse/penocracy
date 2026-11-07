import { json } from "@/lib/http";
import { nameCheckpoint } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json().catch(() => ({}));
    const revision = await nameCheckpoint(userId, chapterId, body.label);
    return json({ id: revision.id, createdAt: revision.createdAt });
  });
}
