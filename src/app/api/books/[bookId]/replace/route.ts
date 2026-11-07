import { json } from "@/lib/http";
import { countInBook, replaceInBook } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await context.params;
  return guard(async (userId) => {
    const body = await request.json();
    if (body.preview) {
      const count = await countInBook(userId, bookId, body.query ?? "", body.chapterId, body.caseSensitive);
      return json({ count });
    }
    const result = await replaceInBook(userId, bookId, body);
    return json(result);
  });
}
