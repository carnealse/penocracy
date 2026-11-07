"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DiffRow } from "@/lib/document";

type RecordItem = {
  id: string;
  entityType: string;
  title: string;
  bookTitle: string;
  location: string;
  preview: string;
  wordCount: number;
  archivedAt: string;
  contentUpdatedAt: string;
};

type RevisionItem = {
  id: string;
  chapterId: string | null;
  kind: string;
  label: string | null;
  wordCount: number;
  createdAt: string;
};

export function ArchiveView({
  bookId,
  title,
  records,
  revisions,
}: {
  bookId: string;
  title: string;
  records: RecordItem[];
  revisions: RevisionItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [left, setLeft] = useState(revisions[1]?.id ?? "");
  const [right, setRight] = useState(revisions[0]?.id ?? "");
  const [rows, setRows] = useState<DiffRow[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const filtered = records.filter((record) => `${record.title} ${record.preview}`.toLowerCase().includes(query.toLowerCase()));
  const history = revisions.filter((revision) => revision.createdAt.includes(query) || (revision.label ?? "").toLowerCase().includes(query.toLowerCase()) || query === "");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground"><a href={`/books/${bookId}`}>Back to manuscript</a></p>
      <h1 className="wordmark mt-2 text-4xl">Archive & History</h1>
      <p className="mt-2 text-muted-foreground">{title}. Deletion here means archival. Nothing in this build is permanently erased.</p>
      <input aria-label="Search archive" className="mt-4 w-full rounded-md border border-border bg-card px-3 py-2" placeholder="Search titles or dates" value={query} onChange={(event) => setQuery(event.target.value)} />
      <section className="mt-8">
        <h2 className="wordmark text-2xl">Archived content</h2>
        <ul className="mt-3 space-y-3">
          {filtered.map((record) => (
            <li key={record.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-semibold">{record.title}</p>
              <p className="text-sm text-muted-foreground">{record.entityType} · {record.bookTitle} · {record.location}</p>
              <p className="text-sm text-muted-foreground">Archived {new Date(record.archivedAt).toLocaleString()} · edited {new Date(record.contentUpdatedAt).toLocaleString()} · {record.wordCount} words</p>
              <p className="mt-2">{record.preview || "No preview text."}</p>
              <button className="mt-2 underline" onClick={async () => {
                await fetch(`/api/archive/${record.id}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                router.refresh();
              }}>Restore to original location</button>
            </li>
          ))}
          {filtered.length === 0 && <li>Nothing archived matches.</li>}
        </ul>
      </section>
      <section className="mt-10">
        <h2 className="wordmark text-2xl">Version history</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <select aria-label="Earlier revision" className="rounded border border-border bg-card px-2 py-1" value={left} onChange={(event) => setLeft(event.target.value)}>
            {revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.label || revision.kind} · {new Date(revision.createdAt).toLocaleString()}</option>)}
          </select>
          <select aria-label="Later revision" className="rounded border border-border bg-card px-2 py-1" value={right} onChange={(event) => setRight(event.target.value)}>
            {revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.label || revision.kind} · {new Date(revision.createdAt).toLocaleString()}</option>)}
          </select>
          <button onClick={async () => {
            const response = await fetch(`/api/revisions/compare?left=${left}&right=${right}`);
            const payload = await response.json();
            setRows(payload.rows ?? []);
          }}>Compare</button>
        </div>
        {rows && (
          <div className="mt-4 space-y-1 rounded-xl border border-border p-4">
            {rows.map((row, index) => (
              <p key={index} className={row.type === "added" ? "diff-added" : row.type === "removed" ? "diff-removed" : ""}>{row.text || "·"}</p>
            ))}
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {history.map((revision) => (
            <li key={revision.id} className="rounded-xl border border-border p-3 text-sm">
              <p>{revision.label || revision.kind} · {new Date(revision.createdAt).toLocaleString()} · {revision.wordCount} words</p>
              <button onClick={async () => {
                const response = await fetch(`/api/revisions/${revision.id}`);
                const payload = await response.json();
                setPreview(JSON.stringify(payload.doc).slice(0, 500));
              }}>Preview</button>
              <button className="ml-3" onClick={async () => {
                if (!window.confirm("Restore this version? The current manuscript is saved as a checkpoint first.")) return;
                await fetch(`/api/revisions/${revision.id}/restore`, { method: "POST" });
                router.push(`/books/${bookId}`);
              }}>Restore</button>
            </li>
          ))}
        </ul>
        {preview && <pre className="mt-4 overflow-auto rounded-xl bg-muted p-3 text-xs">{preview}</pre>}
      </section>
    </main>
  );
}
