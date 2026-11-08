"use client";

import type { Editor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChapterTree } from "@/components/editor/chapter-tree";
import { footnoteNode } from "@/components/editor/extensions";
import type { ChapterNav, EditorData, PartNav } from "@/components/editor/types";
import { WritingSurface } from "@/components/editor/writing-surface";
import { hashDoc, isDoc, newId, reviewDocument, wordCountDoc, type PMDoc } from "@/lib/document";
import { localDb } from "@/lib/local-db";
import { matchesShortcut, mergePreferences, type Preferences } from "@/lib/preferences";

type SaveState = "saved-local" | "syncing" | "saved" | "offline" | "failed" | "conflict";

export function EditorShell({ initial }: { initial: EditorData }) {
  const router = useRouter();
  const editorRef = useRef<Editor | null>(null);
  const [parts, setParts] = useState<PartNav[]>(initial.parts);
  const [chapter, setChapter] = useState(initial.activeChapter);
  const [preferences, setPreferences] = useState<Preferences>(mergePreferences(initial.preferences));
  const [status, setStatus] = useState<SaveState>("saved");
  const [revisions, setRevisions] = useState(initial.revisions);
  const [tab, setTab] = useState<"format" | "review" | "document" | "history" | "preferences">("format");
  const [leftOpen, setLeftOpen] = useState(preferences.leftOpen);
  const [rightOpen, setRightOpen] = useState(preferences.rightOpen);
  const [pendingArchive, setPendingArchive] = useState<ChapterNav | null>(null);
  const [undoArchive, setUndoArchive] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ serverContent: unknown; serverRevision: number } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [palette, setPalette] = useState(false);
  const [selectionWords, setSelectionWords] = useState(0);
  const [footnote, setFootnote] = useState("");
  const [comment, setComment] = useState("");
  const baseRevision = useRef(initial.activeChapter?.revision ?? 1);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const checkpointTimer = useRef<number | null>(null);

  const onReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    const cursor = initial.lastCursor as { from?: number; to?: number } | null;
    if (cursor?.from) {
      const size = editor.state.doc.content.size;
      if (cursor.from < size) editor.commands.setTextSelection({ from: cursor.from, to: Math.min(cursor.to ?? cursor.from, size) });
    }
  }, [initial.lastCursor]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preferences.theme;
    localStorage.setItem("penocracy-theme", document.documentElement.dataset.theme);
  }, [preferences.theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (matchesShortcut(event, preferences.shortcuts.palette)) {
        event.preventDefault();
        setPalette((open) => !open);
      } else if (matchesShortcut(event, preferences.shortcuts.find)) {
        event.preventDefault();
        setFindOpen(true);
        setTab("document");
      } else if (matchesShortcut(event, preferences.shortcuts.replace)) {
        event.preventDefault();
        setFindOpen(true);
        setTab("document");
      } else if (matchesShortcut(event, preferences.shortcuts.checkpoint)) {
        event.preventDefault();
        void flush(true);
      } else if (matchesShortcut(event, preferences.shortcuts.leftPanel)) {
        event.preventDefault();
        setLeftOpen((open) => !open);
      } else if (matchesShortcut(event, preferences.shortcuts.rightPanel)) {
        event.preventDefault();
        setRightOpen((open) => !open);
      } else if (matchesShortcut(event, preferences.shortcuts.focus)) {
        event.preventDefault();
        setPreferences((current) => ({ ...current, focusMode: !current.focusMode }));
      } else if (matchesShortcut(event, preferences.shortcuts.sceneBreak)) {
        event.preventDefault();
        editorRef.current?.chain().focus().insertContent({ type: "sceneBreak" }).run();
      } else if (matchesShortcut(event, preferences.shortcuts.newChapter)) {
        event.preventDefault();
        void addChapter(parts.find((part) => part.kind === "BODY")?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Shortcuts close over the latest chapter actions. Rebinding on every edit would drop keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.shortcuts]);

  async function persistLocal(doc: PMDoc) {
    if (!chapter) return;
    await localDb.chapters.put({
      id: chapter.id,
      bookId: initial.id,
      baseRevision: baseRevision.current,
      content: doc,
      hash: hashDoc(doc),
      synced: false,
      updatedAt: Date.now(),
    });
    setStatus(navigator.onLine ? "saved-local" : "offline");
  }

  async function flush(checkpoint = false) {
    const editor = editorRef.current;
    if (!editor || !chapter || !dirty.current && !checkpoint) return;
    const doc = editor.getJSON() as PMDoc;
    await persistLocal(doc);
    setStatus("syncing");
    const response = await fetch(`/api/chapters/${chapter.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: baseRevision.current,
        content: doc,
        cursor: { from: editor.state.selection.from, to: editor.state.selection.to },
        force: false,
      }),
    });
    const payload = await response.json();
    if (response.status === 409) {
      setConflict({ serverContent: payload.serverContent, serverRevision: payload.serverRevision });
      setStatus("conflict");
      return;
    }
    if (!response.ok) {
      setStatus("failed");
      return;
    }
    baseRevision.current = payload.revision;
    dirty.current = false;
    await localDb.chapters.update(chapter.id, { synced: true, baseRevision: payload.revision });
    setStatus("saved");
    if (checkpoint) {
      const saved = await fetch(`/api/chapters/${chapter.id}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Checkpoint" }),
      });
      if (saved.ok) {
        const revision = await saved.json();
        setRevisions((current) => [{ id: revision.id, chapterId: chapter.id, kind: "MANUAL", label: "Checkpoint", wordCount: payload.wordCount, groupId: null, createdAt: revision.createdAt }, ...current]);
      }
    }
  }

  function onUpdate(editor: Editor) {
    dirty.current = true;
    const text = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");
    setSelectionWords(text.trim() ? text.trim().split(/\s+/).length : 0);
    const doc = editor.getJSON() as PMDoc;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void persistLocal(doc).then(() => flush()); }, preferences.autosaveMs);
    if (!checkpointTimer.current) {
      checkpointTimer.current = window.setTimeout(() => {
        checkpointTimer.current = null;
        if (dirty.current) void flush(true);
      }, 5 * 60 * 1000);
    }
  }

  useEffect(() => {
    const save = () => { void flush(); };
    window.addEventListener("visibilitychange", save);
    window.addEventListener("online", save);
    return () => {
      window.removeEventListener("visibilitychange", save);
      window.removeEventListener("online", save);
    };
  });

  async function openChapter(id: string) {
    await flush();
    const response = await fetch(`/api/chapters/${id}`);
    const payload = await response.json();
    if (!response.ok) return;
    const local = await localDb.chapters.get(id);
    const content = local && !local.synced ? local.content : payload.content;
    setChapter({ ...payload, content });
    baseRevision.current = payload.revision;
    dirty.current = !!local && !local.synced;
    editorRef.current?.commands.setContent(content as object, { emitUpdate: false });
    if (local && !local.synced) void flush();
  }

  async function refreshOutline() {
    const response = await fetch(`/api/books/${initial.id}`);
    if (!response.ok) return null;
    const data = (await response.json()) as EditorData;
    setParts(data.parts);
    return data;
  }

  async function addChapter(partId?: string, title?: string) {
    await flush();
    const response = await fetch(`/api/books/${initial.id}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId, title }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus("failed");
      return;
    }
    await refreshOutline();
    if (payload.id) await openChapter(payload.id);
  }

  async function duplicateChapter(chapterId: string) {
    await flush();
    const response = await fetch(`/api/chapters/${chapterId}/duplicate`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setStatus("failed");
      return;
    }
    await refreshOutline();
    if (payload.id) await openChapter(payload.id);
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    await flush();
    const response = await fetch(`/api/chapters/${pendingArchive.id}/archive`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      setUndoArchive(payload.archiveId);
      setParts((current) => current.map((part) => ({ ...part, chapters: part.chapters.filter((item) => item.id !== pendingArchive.id) })));
      if (chapter?.id === pendingArchive.id) {
        const next = parts.flatMap((part) => part.chapters).find((item) => item.id !== pendingArchive.id);
        if (next) await openChapter(next.id);
      }
    }
    setPendingArchive(null);
  }

  const words = chapter ? wordCountDoc(isDoc(chapter.content) ? chapter.content : { type: "doc", content: [] }) : 0;
  const totalWords = parts.reduce((sum, part) => sum + part.chapters.reduce((inner, item) => inner + (item.id === chapter?.id ? words : item.wordCount), 0), 0);
  const bodyPart = parts.find((part) => part.kind === "BODY");
  const chapterNumber = bodyPart && chapter ? (() => {
    const index = bodyPart.chapters.findIndex((item) => item.id === chapter.id);
    return index >= 0 ? String(index + 1) : null;
  })() : null;
  const issues = useMemo(() => (chapter && isDoc(chapter.content) ? reviewDocument(chapter.content) : []), [chapter]);
  const statusLabel: Record<SaveState, string> = {
    "saved-local": "Saved locally",
    syncing: "Syncing",
    saved: "Saved to server",
    offline: "Offline",
    failed: "Save failed",
    conflict: "Conflict detected",
  };

  return (
    <div className="editor-shell" style={{ gridTemplateColumns: `${leftOpen && !preferences.distractionFree ? `${preferences.leftWidth}px` : "0px"} 1fr ${rightOpen && !preferences.distractionFree && !preferences.focusMode ? `${preferences.rightWidth}px` : "0px"}` }}>
      <aside className="manuscript-aside" hidden={!leftOpen || preferences.distractionFree}>
        <ChapterTree
          parts={parts}
          activeId={chapter?.id ?? null}
          authorName={initial.authorName}
          onOpen={(id) => void openChapter(id)}
          onReorder={(next) => {
            setParts(next);
            void fetch(`/api/books/${initial.id}/structure`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ parts: next.map((part) => ({ id: part.id, chapterIds: part.chapters.map((item) => item.id) })) }),
            });
          }}
          onArchive={setPendingArchive}
          onRename={(item, title) => {
            setParts((current) => current.map((part) => ({ ...part, chapters: part.chapters.map((chapterItem) => chapterItem.id === item.id ? { ...chapterItem, title } : chapterItem) })));
            void fetch(`/api/chapters/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
          }}
          onAdd={(partId, title) => void addChapter(partId, title)}
          onDuplicate={(id) => void duplicateChapter(id)}
        />
      </aside>
      <section className="editor-stage" style={{ paddingTop: preferences.typewriter ? "30vh" : undefined }}>
        <header className="editor-stats">
          <div className="editor-stats-title">
            <Link href="/">Library</Link>
            <strong>{initial.title}</strong>
            <span>{chapter?.title} · {statusLabel[status]}</span>
          </div>
          <div className="editor-stats-figures">
            <span>{words.toLocaleString()} words</span>
            <span>{totalWords.toLocaleString()} in the book</span>
            {selectionWords > 0 && <span>{selectionWords} selected</span>}
            {preferences.showReadingTime && <span>{Math.max(1, Math.round(totalWords / 250))} min</span>}
            {preferences.goalWords ? <span>{words} / {preferences.goalWords}</span> : null}
            <Link href={`/books/${initial.id}/export`}>Export</Link>
            <button type="button" onClick={() => setLeftOpen((open) => !open)}>Nav</button>
            <button type="button" onClick={() => setRightOpen((open) => !open)}>Tools</button>
            <button type="button" onClick={() => setPreferences((current) => ({ ...current, distractionFree: !current.distractionFree }))}>Focus</button>
          </div>
        </header>
        {chapter && (
          <WritingSurface
            key={chapter.id}
            content={chapter.content}
            preferences={preferences}
            title={chapter.title}
            number={chapterNumber}
            onReady={onReady}
            onUpdate={onUpdate}
          />
        )}
      </section>
      <aside className="tool-panel" hidden={!rightOpen || preferences.distractionFree || preferences.focusMode}>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {(["format", "review", "document", "history", "preferences"] as const).map((item) => (
            <button key={item} className={tab === item ? "font-semibold" : "text-muted-foreground"} onClick={() => setTab(item)}>{item}</button>
          ))}
        </div>
        {tab === "format" && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button onClick={() => editorRef.current?.chain().focus().toggleBold().run()}>Bold</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleItalic().run()}>Italic</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleUnderline().run()}>Underline</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleStrike().run()}>Strike</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run()}>Heading</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleBlockquote().run()}>Quote</button>
            <button onClick={() => editorRef.current?.chain().focus().toggleBulletList().run()}>List</button>
            <button onClick={() => editorRef.current?.chain().focus().insertContent({ type: "sceneBreak" }).run()}>Scene break</button>
            <button onClick={() => editorRef.current?.chain().focus().setTextAlign("left").run()}>Left</button>
            <button onClick={() => editorRef.current?.chain().focus().setTextAlign("justify").run()}>Justify</button>
            <button onClick={() => editorRef.current?.chain().focus().unsetAllMarks().clearNodes().run()}>Clear</button>
            <button onClick={() => editorRef.current?.chain().focus().insertContent("\u00A0").run()}>Nonbreaking space</button>
            <label className="col-span-2 grid gap-1">Footnote
              <input className="rounded border border-border bg-background px-2 py-1" value={footnote} onChange={(event) => setFootnote(event.target.value)} />
              <button onClick={() => { if (!footnote.trim()) return; editorRef.current?.chain().focus().insertContent(footnoteNode(footnote.trim())).run(); setFootnote(""); }}>Insert footnote</button>
            </label>
            <label className="col-span-2 grid gap-1">Comment
              <input className="rounded border border-border bg-background px-2 py-1" value={comment} onChange={(event) => setComment(event.target.value)} />
              <button onClick={() => {
                if (!comment.trim() || !chapter) return;
                const id = newId();
                editorRef.current?.chain().focus().setMark("comment", { id }).run();
                void fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, chapterId: chapter.id, body: comment }) });
                setComment("");
              }}>Attach comment</button>
            </label>
          </div>
        )}
        {tab === "review" && (
          <ul className="space-y-2 text-sm">
            {issues.length === 0 && <li>No repeated words, double spaces, or mixed quotation marks in this chapter.</li>}
            {issues.map((issue, index) => <li key={`${issue.rule}-${index}`}><strong>{issue.rule}</strong> {issue.message} <span className="text-muted-foreground">{issue.excerpt}</span></li>)}
            <li className="text-muted-foreground">These are mechanical checks. Penocracy does not invent grammar advice.</li>
          </ul>
        )}
        {tab === "document" && (
          <div className="grid gap-2 text-sm">
            <p><a href={`/books/${initial.id}/archive`}>Open Archive & History</a></p>
            {(findOpen || true) && (
              <>
                <input aria-label="Find" className="rounded border border-border bg-background px-2 py-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find" />
                <input aria-label="Replace" className="rounded border border-border bg-background px-2 py-1" value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Replace" />
                <button onClick={async () => {
                  const response = await fetch(`/api/books/${initial.id}/replace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, replacement, chapterId: chapter?.id, preview: true }) });
                  const payload = await response.json();
                  window.alert(`${payload.count ?? 0} matches in this chapter. Replacing will checkpoint the manuscript first.`);
                }}>Preview matches</button>
                <button onClick={async () => {
                  await fetch(`/api/books/${initial.id}/replace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, replacement, chapterId: chapter?.id }) });
                  if (chapter) await openChapter(chapter.id);
                }}>Replace in chapter</button>
                <button onClick={async () => {
                  await fetch(`/api/books/${initial.id}/replace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, replacement }) });
                  if (chapter) await openChapter(chapter.id);
                }}>Replace in manuscript</button>
              </>
            )}
          </div>
        )}
        {tab === "history" && (
          <ul className="space-y-2 text-sm">
            {revisions.map((revision) => (
              <li key={revision.id} className="rounded border border-border p-2">
                <p>{revision.label || revision.kind}</p>
                <p className="text-muted-foreground">{new Date(revision.createdAt).toLocaleString()} · {revision.wordCount} words</p>
                <button onClick={async () => {
                  if (!window.confirm("Restore this revision? The current text is checkpointed first.")) return;
                  await fetch(`/api/revisions/${revision.id}/restore`, { method: "POST" });
                  if (revision.chapterId) await openChapter(revision.chapterId);
                }}>Restore</button>
              </li>
            ))}
          </ul>
        )}
        {tab === "preferences" && (
          <div className="grid gap-2 text-sm">
            <label>Theme
              <select className="w-full rounded border border-border bg-background px-2 py-1" value={preferences.theme} onChange={(event) => setPreferences({ ...preferences, theme: event.target.value as Preferences["theme"] })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="sepia">Sepia</option>
                <option value="contrast">High contrast</option>
              </select>
            </label>
            <label>Font
              <select className="w-full rounded border border-border bg-background px-2 py-1" value={preferences.font} onChange={(event) => setPreferences({ ...preferences, font: event.target.value as Preferences["font"] })}>
                <option value="serif">Serif</option>
                <option value="sans">Sans</option>
                <option value="mono">Mono</option>
              </select>
            </label>
            <label>Size <input type="range" min={14} max={28} value={preferences.fontSize} onChange={(event) => setPreferences({ ...preferences, fontSize: Number(event.target.value) })} /></label>
            <label>Width <input type="range" min={480} max={980} value={preferences.writingWidth} onChange={(event) => setPreferences({ ...preferences, writingWidth: Number(event.target.value) })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.typewriter} onChange={(event) => setPreferences({ ...preferences, typewriter: event.target.checked })} /> Typewriter scrolling</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={preferences.firstLineIndent} onChange={(event) => setPreferences({ ...preferences, firstLineIndent: event.target.checked })} /> First-line indent</label>
            <label>Goal words <input className="w-full rounded border border-border bg-background px-2 py-1" value={preferences.goalWords ?? ""} onChange={(event) => setPreferences({ ...preferences, goalWords: event.target.value ? Number(event.target.value) : null })} /></label>
            <button onClick={() => void fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) })}>Save preferences</button>
            <p className="text-muted-foreground">Cmd/Ctrl+S checkpoint, Cmd/Ctrl+K commands, Cmd/Ctrl+F find, Cmd/Ctrl+Alt+1 and 2 toggle panels.</p>
          </div>
        )}
      </aside>
      {pendingArchive && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="archive-title" className="w-full max-w-md rounded-2xl bg-card p-5">
            <h2 id="archive-title" className="wordmark text-2xl">Archive Chapter?</h2>
            <p className="mt-2">This chapter will be removed from your manuscript but preserved in Archive & History. You can restore it at any time.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingArchive(null)}>Cancel</button>
              <button className="rounded-md bg-accent px-3 py-2 text-accent-foreground" onClick={() => void confirmArchive()}>Archive Chapter</button>
            </div>
          </div>
        </div>
      )}
      {undoArchive && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-card px-4 py-2 shadow-none border border-border">
          Chapter archived. <button type="button" onClick={async () => { await fetch(`/api/archive/${undoArchive}/restore`, { method: "POST" }); setUndoArchive(null); await refreshOutline(); }}>Undo</button>
        </div>
      )}
      {conflict && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-card p-5">
            <h2 className="wordmark text-2xl">Conflict detected</h2>
            <p className="mt-2">This chapter changed somewhere else. Neither copy will be discarded until you choose.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={async () => {
                const editor = editorRef.current;
                if (!editor || !chapter) return;
                await fetch(`/api/chapters/${chapter.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision: conflict.serverRevision, content: editor.getJSON(), force: true }) });
                setConflict(null);
                await openChapter(chapter.id);
              }}>Keep mine</button>
              <button onClick={() => {
                editorRef.current?.commands.setContent(conflict.serverContent as object, { emitUpdate: false });
                baseRevision.current = conflict.serverRevision;
                dirty.current = false;
                setConflict(null);
                setStatus("saved");
              }}>Keep the server copy</button>
            </div>
          </div>
        </div>
      )}
      {palette && (
        <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/40 p-16" onMouseDown={() => setPalette(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-3" onMouseDown={(event) => event.stopPropagation()}>
            {["Checkpoint", "New chapter", "Toggle focus", "Open export", "Open archive"].map((action) => (
              <button key={action} className="block w-full px-3 py-2 text-left" onClick={() => {
                setPalette(false);
                if (action === "Checkpoint") void flush(true);
                if (action === "New chapter") void addChapter(parts.find((part) => part.kind === "BODY")?.id);
                if (action === "Toggle focus") setPreferences((current) => ({ ...current, distractionFree: !current.distractionFree }));
                if (action === "Open export") router.push(`/books/${initial.id}/export`);
                if (action === "Open archive") router.push(`/books/${initial.id}/archive`);
              }}>{action}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
