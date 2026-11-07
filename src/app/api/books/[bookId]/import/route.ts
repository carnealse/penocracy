import { json } from "@/lib/http";
import { importChapters } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    const id = await importChapters(userId, { ...body, bookId });
    return json({ id });
  });
}
