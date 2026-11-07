import { SignInPanel } from "@/components/auth/sign-in-panel";
import { LibraryView } from "@/components/library/library-view";
import { auth } from "@/lib/auth";
import { listBooks } from "@/server/manuscript";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) return <SignInPanel />;
  const books = await listBooks(session.user.id);
  return <LibraryView books={books} name={session.user.name || session.user.email || ""} />;
}
