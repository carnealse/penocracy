import { json } from "@/lib/http";
import { readArtifact } from "@/server/exports";
import { guard } from "@/server/guard";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  return guard(async (userId) => {
    const decoded = key.map(decodeURIComponent).join("/");
    try {
      const file = await readArtifact(userId, decoded);
      return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.contentType } });
    } catch {
      return json({ error: "That file is not available." }, 404);
    }
  });
}
