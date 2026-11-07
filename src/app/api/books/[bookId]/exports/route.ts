import { json } from "@/lib/http";
import { enqueueExport } from "@/server/exports";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    const job = await enqueueExport(userId, bookId, body);
    return json({
      id: job.id,
      status: job.status,
      revisionCreatedAt: job.revisionCreatedAt.toISOString(),
    }, 202);
  });
}
