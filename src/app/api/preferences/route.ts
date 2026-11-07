import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { mergePreferences } from "@/lib/preferences";
import { guard } from "@/server/guard";

export async function PUT(request: Request) {
  return guard(async (userId) => {
    const data = mergePreferences(await request.json());
    await prisma.preference.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
    return json(data);
  });
}
