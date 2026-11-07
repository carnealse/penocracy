"use client";

import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { organizeLibrary } from "@/lib/shelf";
import type { ImportChapter, ImportPreview } from "@/lib/import-manuscript";

export type LibraryBook = {
  id: string;
  title: string;
  authorName: string | null;
  coverColor: string;
  coverObjectKey: string | null;
  pinned: boolean;
  lastEditedAt: string;
  wordCount: number;
};

const COLORS = ["#6b4423", "#1f3a5f", "#6e2b3a", "#2f4f3e", "#3d3a36", "#7a4e2d", "#24342c", "#4a3b63"];

export function LibraryView({ books, name }: { books: LibraryBook[]; name: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(name);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [targetBook, setTargetBook] = useState("");
  const [menu, setMenu] = useState<LibraryBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = books.filter((book) => book.title.toLowerCase().includes(query.trim().toLowerCase()));
  const shelves = useMemo(() => organizeLibrary(filtered), [filtered]);

  async function createBook(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, authorName: author }),
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error);
    router.push(`/books/${payload.id}`);
  }

  async function onFile(file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/import/preview", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error);
    setPreview(payload);
    setTitle(payload.suggestedTitle);
  }

  async function commitImport() {
    if (!preview) return;
    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: targetBook || undefined,
        title,
        authorName: author,
        chapters: preview.chapters,
      }),
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error);
    router.push(`/books/${payload.id}`);
    router.refresh();
  }

  async function patch(id: string, body: object) {
    await fetch(`/api/books/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Penocracy</p>
          <h1 className="wordmark text-4xl">Library</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search books" placeholder="Search titles" className="rounded-md border border-border bg-card px-3 py-2" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="rounded-md border border-border px-3 py-2" onClick={() => setImporting(true)}>Import manuscript</button>
          <button className="rounded-md bg-accent px-3 py-2 text-accent-foreground" onClick={() => setCreating(true)}>New book</button>
          <button className="rounded-md px-3 py-2 text-muted-foreground" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </header>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {books.length === 0 && <p className="mb-6 text-muted-foreground">The shelves are empty. Start a book, or import a manuscript you already have.</p>}
      <Shelf label="Pinned and recent" books={shelves.top} onOpen={(id) => router.push(`/books/${id}`)} onMenu={setMenu} />
      <Shelf label="All books" books={shelves.rest} onOpen={(id) => router.push(`/books/${id}`)} onMenu={setMenu} />

      {creating && (
        <Dialog title="New book" onClose={() => setCreating(false)}>
          <form onSubmit={createBook} className="grid gap-3">
            <label className="grid gap-1 text-sm">Title<input required className="rounded-md border border-border bg-background px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="grid gap-1 text-sm">Author<input className="rounded-md border border-border bg-background px-3 py-2" value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
            <button className="rounded-md bg-accent px-3 py-2 text-accent-foreground">Create and open</button>
          </form>
        </Dialog>
      )}

      {importing && (
        <Dialog title="Import manuscript" onClose={() => { setImporting(false); setPreview(null); }}>
          <div className="grid gap-3 text-sm">
            <input aria-label="Manuscript file" type="file" accept=".docx,.epub,.txt,.text,.md" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
            {preview && (
              <>
                <p>{preview.warnings[0]}</p>
                <label className="grid gap-1">Book title<input className="rounded-md border border-border bg-background px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                <label className="grid gap-1">
                  Add to an existing book
                  <select className="rounded-md border border-border bg-background px-3 py-2" value={targetBook} onChange={(event) => setTargetBook(event.target.value)}>
                    <option value="">Create a new book</option>
                    {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
                  </select>
                </label>
                <ul className="max-h-64 space-y-2 overflow-auto">
                  {preview.chapters.map((chapter, index) => (
                    <li key={`${chapter.title}-${index}`} className="rounded-md border border-border p-2">
                      <input aria-label={`Chapter ${index + 1} title`} className="w-full bg-transparent" value={chapter.title} onChange={(event) => updateChapter(preview, index, event.target.value, setPreview)} />
                      <p className="text-muted-foreground">{chapter.paragraphs.length} paragraphs</p>
                      {index > 0 && <button type="button" onClick={() => mergeChapter(preview, index, setPreview)}>Merge with previous</button>}
                    </li>
                  ))}
                </ul>
                <button className="rounded-md bg-accent px-3 py-2 text-accent-foreground" onClick={commitImport}>Import these chapters</button>
              </>
            )}
          </div>
        </Dialog>
      )}

      {menu && (
        <Dialog title={menu.title} onClose={() => setMenu(null)}>
          <div className="grid gap-2 text-sm">
            <button onClick={async () => { const next = window.prompt("Rename book", menu.title); if (next) { await patch(menu.id, { title: next }); setMenu(null); } }}>Rename</button>
            <button onClick={async () => { await patch(menu.id, { pinned: !menu.pinned }); setMenu(null); }}>{menu.pinned ? "Unpin" : "Pin"}</button>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button key={color} aria-label={`Cover ${color}`} className="h-8 w-8 rounded" style={{ background: color }} onClick={async () => { await patch(menu.id, { coverColor: color }); setMenu(null); }} />
              ))}
            </div>
            <label className="grid gap-1">Cover image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set("file", file);
              await fetch(`/api/books/${menu.id}/cover`, { method: "POST", body: form });
              setMenu(null);
              router.refresh();
            }} /></label>
            <button onClick={async () => { const response = await fetch(`/api/books/${menu.id}/duplicate`, { method: "POST" }); const payload = await response.json(); router.push(`/books/${payload.id}`); }}>Duplicate</button>
            <button className="text-danger" onClick={async () => {
              if (!window.confirm(`Archive “${menu.title}”? You can restore it from Archive & History.`)) return;
              await fetch(`/api/books/${menu.id}`, { method: "DELETE" });
              setMenu(null);
              router.refresh();
            }}>Archive book</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

function Shelf({ label, books, onOpen, onMenu }: { label: string; books: Array<LibraryBook & { recent?: boolean }>; onOpen: (id: string) => void; onMenu: (book: LibraryBook) => void }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</h2>
      <div className="shelf-row">
        {books.map((book) => {
          const style = book.coverObjectKey
            ? { backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 45%), transparent 40%), url(/api/objects/${book.coverObjectKey.split("/").map(encodeURIComponent).join("/")})` }
            : { ["--book" as string]: book.coverColor };
          return (
            <button key={book.id} className={book.coverObjectKey ? "cover" : "spine"} style={style} onClick={() => onOpen(book.id)} onContextMenu={(event) => { event.preventDefault(); onMenu(book); }}>
              {book.recent && <span className="recent-mark" title="Recently edited" />}
              <strong>{book.title}</strong>
              <small>{book.authorName || "Untitled author"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-5" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="wordmark text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function updateChapter(preview: ImportPreview, index: number, title: string, setPreview: (preview: ImportPreview) => void) {
  const chapters = preview.chapters.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, title } : chapter);
  setPreview({ ...preview, chapters });
}

function mergeChapter(preview: ImportPreview, index: number, setPreview: (preview: ImportPreview) => void) {
  const chapters = preview.chapters.slice();
  const previous = chapters[index - 1];
  const current = chapters[index];
  const merged: ImportChapter = { title: previous.title, paragraphs: [...previous.paragraphs, ...current.paragraphs] };
  chapters.splice(index - 1, 2, merged);
  setPreview({ ...preview, chapters });
}
