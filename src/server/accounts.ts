import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { defaultPreferences } from "@/lib/preferences";

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(80).optional(),
});

export async function registerUser(input: unknown) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Use a valid email and a password of at least 8 characters.");
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with that email already exists.");
  const passwordHash = await hash(parsed.data.password, 12);
  return prisma.user.create({
    data: {
      email,
      name: parsed.data.name || null,
      passwordHash,
      preference: { create: { data: defaultPreferences } },
    },
    select: { id: true, email: true, name: true },
  });
}
