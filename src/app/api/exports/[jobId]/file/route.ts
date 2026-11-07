import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { readArtifact } from "@/server/exports";
import { guard } from "@/server/guard";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return guard(async (userId) => {
    const job = await prisma.exportJob.findFirst({ where: { id: jobId, userId } });
    if (!job?.artifactKey) return json({ error: "The export is not ready." }, 404);
    const file = await readArtifact(userId, job.artifactKey);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName}"`,
      },
    });
  });
}
