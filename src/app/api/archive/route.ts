import { json } from "@/lib/http";
import { listArchive } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(request: Request) {
  const bookId = new URL(request.url).searchParams.get("bookId") ?? undefined;
  return guard(async (userId) => json(await listArchive(userId, bookId)));
}
