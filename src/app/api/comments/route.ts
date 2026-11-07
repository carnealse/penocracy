import { json } from "@/lib/http";
import { addComment, listComments } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(request: Request) {
  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) return json({ error: "Missing book." }, 400);
  return guard(async (userId) => json(await listComments(userId, bookId)));
}

export async function POST(request: Request) {
  return guard(async (userId) => {
    const body = await request.json();
    const comment = await addComment(userId, body.chapterId, { id: body.id, body: body.body });
    return json(comment);
  });
}
