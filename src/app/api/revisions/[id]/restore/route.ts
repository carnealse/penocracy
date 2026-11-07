import { json } from "@/lib/http";
import { restoreRevision } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return guard(async (userId) => json(await restoreRevision(userId, id)));
}
