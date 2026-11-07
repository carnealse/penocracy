import { json } from "@/lib/http";
import { compareRevisions } from "@/server/manuscript";
import { guard } from "@/server/guard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const left = url.searchParams.get("left");
  const right = url.searchParams.get("right");
  if (!left || !right) return json({ error: "Choose two revisions." }, 400);
  return guard(async (userId) => json(await compareRevisions(userId, left, right)));
}
