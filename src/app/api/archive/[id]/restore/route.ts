import { json } from "@/lib/http";
import { restoreArchive } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return guard(async (userId) => {
    const body = await request.json().catch(() => ({}));
    return json(await restoreArchive(userId, id, body));
  });
}
