import { json } from "@/lib/http";
import { previewManuscript } from "@/lib/import-manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request) {
  return guard(async () => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose a DOCX, EPUB, or TXT file." }, 400);
    const preview = await previewManuscript(file.name, Buffer.from(await file.arrayBuffer()));
    return json(preview);
  });
}
