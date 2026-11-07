import { json } from "@/lib/http";
import { createBook, listBooks } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET() {
  return guard(async (userId) => json(await listBooks(userId)));
}

export async function POST(request: Request) {
  return guard(async (userId) => {
    const body = await request.json();
    const id = await createBook(userId, body);
    return json({ id }, 201);
  });
}
