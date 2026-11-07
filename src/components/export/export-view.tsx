"use client";

import { useState } from "react";
import { presetDefaults, type ExportOptions, type ExportPresetName } from "@/lib/export-options";

export function ExportView({ bookId, title, chapters }: { bookId: string; title: string; chapters: Array<{ id: string; title: string }> }) {
  const [options, setOptions] = useState<ExportOptions>(presetDefaults.paperback);
  const [selected, setSelected] = useState<string[]>([]);
  const [job, setJob] = useState<{ id: string; status: string; error?: string | null; revisionCreatedAt?: string } | null>(null);
  const [presetName, setPresetName] = useState("");

  function applyPreset(name: ExportPresetName) {
    setOptions({ ...presetDefaults[name], format: options.format });
  }

  async function start() {
    const response = await fetch(`/api/books/${bookId}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, chapterIds: selected.length ? selected : null }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setJob({ id: "", status: "FAILED", error: payload.error });
      return;
    }
    setJob(payload);
    const timer = window.setInterval(async () => {
      const next = await fetch(`/api/exports/${payload.id}`).then((result) => result.json());
      setJob(next);
      if (next.status === "READY" || next.status === "FAILED") window.clearInterval(timer);
    }, 1000);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground"><a href={`/books/${bookId}`}>Back to manuscript</a></p>
        <h1 className="wordmark mt-2 text-4xl">Export</h1>
        <p className="mt-2 text-muted-foreground">{title}</p>
        <div className="mt-4 grid gap-3 text-sm">
          <label>Format
            <select className="w-full rounded border border-border bg-card px-2 py-2" value={options.format} onChange={(event) => setOptions({ ...options, format: event.target.value as ExportOptions["format"] })}>
              <option value="PDF">PDF</option>
              <option value="EPUB">EPUB</option>
              <option value="DOCX">DOCX</option>
            </select>
          </label>
          <label>Preset
            <select className="w-full rounded border border-border bg-card px-2 py-2" value={options.preset} onChange={(event) => applyPreset(event.target.value as ExportPresetName)}>
              <option value="manuscript">Standard manuscript</option>
              <option value="paperback">Paperback novel</option>
              <option value="ebook">Ebook</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>Trim
            <select className="w-full rounded border border-border bg-card px-2 py-2" value={options.trim} onChange={(event) => setOptions({ ...options, trim: event.target.value as ExportOptions["trim"], preset: "custom" })}>
              <option value="5x8">5 × 8 in</option>
              <option value="5.5x8.5">5.5 × 8.5 in</option>
              <option value="6x9">6 × 9 in</option>
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.numbering} onChange={(event) => setOptions({ ...options, numbering: event.target.checked })} /> Chapter numbers</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeFront} onChange={(event) => setOptions({ ...options, includeFront: event.target.checked })} /> Front matter</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeBack} onChange={(event) => setOptions({ ...options, includeBack: event.target.checked })} /> Back matter</label>
          <fieldset>
            <legend>Chapters</legend>
            {chapters.map((chapter) => (
              <label key={chapter.id} className="flex items-center gap-2">
                <input type="checkbox" checked={selected.includes(chapter.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, chapter.id] : current.filter((id) => id !== chapter.id))} />
                {chapter.title}
              </label>
            ))}
            <p className="text-muted-foreground">Leave every box clear to export the whole book.</p>
          </fieldset>
          <label>Save preset name
            <input className="w-full rounded border border-border bg-card px-2 py-2" value={presetName} onChange={(event) => setPresetName(event.target.value)} />
          </label>
          <button onClick={() => void fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: presetName || "Custom", format: options.format, data: options }) })}>Save preset</button>
          <button className="rounded-md bg-accent px-3 py-2 text-accent-foreground" onClick={() => void start()}>Create export</button>
          {job?.revisionCreatedAt && <p>Revision {new Date(job.revisionCreatedAt).toLocaleString()}</p>}
          {job?.status && <p>Status: {job.status}</p>}
          {job?.error && <p className="text-danger">{job.error}</p>}
        </div>
      </div>
      <section className="min-h-[70vh] rounded-2xl border border-border bg-card p-4">
        {job?.status === "READY" && options.format === "PDF" && (
          <iframe title="Paginated PDF preview" className="h-[75vh] w-full" src={`/api/exports/${job.id}/file`} />
        )}
        {job?.status === "READY" && options.format === "EPUB" && (
          <div>
            <p className="mb-3">Reflowable EPUB preview uses the same XHTML packaged in the file. Download it to read the navigation document in an ebook app.</p>
            <a className="underline" href={`/api/exports/${job.id}/file?download=1`}>Download EPUB</a>
          </div>
        )}
        {job?.status === "READY" && options.format === "DOCX" && (
          <div>
            <p>This layout preview is the manuscript structure that was written into Word styles. Microsoft Word may paginate headers, footnotes, and line breaks differently.</p>
            <a className="mt-3 inline-block underline" href={`/api/exports/${job.id}/file?download=1`}>Download DOCX</a>
          </div>
        )}
        {job?.status === "READY" && options.format !== "DOCX" && <a className="mt-3 inline-block underline" href={`/api/exports/${job.id}/file?download=1`}>Download</a>}
        {!job && <p className="text-muted-foreground">Choose a format. The file is built from one saved revision, not from unsaved keystrokes.</p>}
      </section>
    </main>
  );
}
