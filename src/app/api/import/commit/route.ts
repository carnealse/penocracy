import { json } from "@/lib/http";
import { importChapters } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function POST(request: Request) {
  return guard(async (userId) => {
    const body = await request.json();
    const id = await importChapters(userId, body);
    return json({ id });
  });
}
