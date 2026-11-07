import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { guard } from "@/server/guard";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return guard(async (userId) => {
    const job = await prisma.exportJob.findFirst({ where: { id: jobId, userId } });
    if (!job) return json({ error: "That export is not available." }, 404);
    return json({
      id: job.id,
      status: job.status,
      format: job.format,
      error: job.error,
      revisionCreatedAt: job.revisionCreatedAt.toISOString(),
      validation: job.validation,
    });
  });
}
