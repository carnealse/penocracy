import { json, HttpError } from "@/lib/http";
import { registerUser } from "@/server/accounts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await registerUser(body);
    return json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Could not create the account." }, 500);
  }
}
