import { currentUserId } from "@/lib/auth";
import { HttpError, json } from "@/lib/http";

export async function guard(run: (userId: string) => Promise<Response>) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Unauthorized" }, 401);
  try {
    return await run(userId);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "The request failed." }, 500);
  }
}
