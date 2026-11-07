import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { guard } from "@/server/guard";

export async function POST(request: Request) {
  return guard(async (userId) => {
    const body = await request.json();
    const preset = await prisma.exportPreset.create({
      data: {
        userId,
        name: String(body.name || "Custom"),
        format: body.format === "EPUB" || body.format === "DOCX" ? body.format : "PDF",
        data: body.data ?? {},
      },
    });
    return json({ id: preset.id }, 201);
  });
}
