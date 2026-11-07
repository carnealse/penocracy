import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { updateBook } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose an image." }, 400);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return json({ error: "Covers can be PNG, JPEG, or WebP." }, 400);
    }
    if (file.size > 2_000_000) return json({ error: "Cover images must be under 2 MB." }, 400);
    const key = `covers/${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "-")}`;
    await prisma.storedObject.create({
      data: {
        key,
        userId,
        contentType: file.type,
        fileName: file.name,
        data: Buffer.from(await file.arrayBuffer()),
      },
    });
    await updateBook(userId, bookId, { coverObjectKey: key });
    return json({ key });
  });
}
