"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { ChapterNav, PartNav } from "@/components/editor/types";

export function ChapterTree({
  parts,
  activeId,
  onOpen,
  onReorder,
  onArchive,
  onRename,
  onAdd,
  onDuplicate,
}: {
  parts: PartNav[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onReorder: (parts: PartNav[]) => void;
  onArchive: (chapter: ChapterNav) => void;
  onRename: (chapter: ChapterNav, title: string) => void;
  onAdd: (partId: string) => void;
  onDuplicate: (chapterId: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragging = useMemo(() => parts.flatMap((part) => part.chapters).find((chapter) => chapter.id === draggingId), [parts, draggingId]);

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const current = dragging;
    setDraggingId(null);
    setOverTrash(false);
    if (!current || !event.over) return;
    if (event.over.id === "trash") {
      onArchive(current);
      return;
    }
    const next = moveChapter(parts, String(event.active.id), String(event.over.id));
    if (next) onReorder(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const pointer = pointerWithin(args).find((hit) => hit.id === "trash");
        if (pointer) return [pointer];
        return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => container.id !== "trash") });
      }}
      onDragStart={onDragStart}
      onDragOver={(event) => setOverTrash(event.over?.id === "trash")}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setDraggingId(null); setOverTrash(false); }}
    >
      <div className="flex h-full flex-col gap-4 overflow-auto p-3">
        {parts.map((part) => (
          <section key={part.id}>
            <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>{part.title}</span>
              <button onClick={() => onAdd(part.id)}>+ Chapter</button>
            </div>
            <SortableContext items={part.chapters.map((chapter) => chapter.id)} strategy={verticalListSortingStrategy}>
              {part.chapters.map((chapter, index) => (
                <ChapterRow
                  key={chapter.id}
                  chapter={chapter}
                  number={part.kind === "BODY" && chapter.showHeading && chapter.numberMode !== "none" ? (chapter.numberMode === "custom" && chapter.customNumber ? chapter.customNumber : String(index + 1)) : null}
                  active={chapter.id === activeId}
                  onOpen={() => onOpen(chapter.id)}
                  onRename={(title) => onRename(chapter, title)}
                  onDuplicate={() => onDuplicate(chapter.id)}
                  onArchive={() => onArchive(chapter)}
                />
              ))}
            </SortableContext>
          </section>
        ))}
      </div>
      {draggingId && <div className="dim-layer" />}
      <TrashTarget active={overTrash} visible={!!draggingId} />
      <DragOverlay>
        {dragging && <div className="rounded-md border border-border bg-card px-3 py-2 shadow-none">{dragging.title}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function ChapterRow({
  chapter,
  number,
  active,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
}: {
  chapter: ChapterNav;
  number: string | null;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: chapter.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`mb-1 rounded-md border px-2 py-1 ${active ? "border-accent bg-muted" : "border-transparent"}`}>
      <div className="flex items-center gap-2">
        <button aria-label={`Drag ${chapter.title}`} className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>⋮⋮</button>
        <button className="min-w-0 flex-1 text-left" onClick={onOpen} onDoubleClick={() => setEditing(true)}>
          <span className="block truncate">{number ? `${number}. ` : ""}{chapter.title}</span>
          <span className="text-xs text-muted-foreground">{chapter.wordCount} words</span>
        </button>
      </div>
      {editing && (
        <form onSubmit={(event) => { event.preventDefault(); onRename(title); setEditing(false); }} className="mt-1 flex gap-1">
          <input aria-label="Chapter title" className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <button onClick={() => setEditing(true)}>Rename</button>
        <button onClick={onDuplicate}>Duplicate</button>
        <button onClick={onArchive}>Archive</button>
      </div>
      {chapter.scenes.length > 0 && (
        <ul className="mt-1 space-y-1 pl-6 text-xs text-muted-foreground">
          {chapter.scenes.map((scene) => (
            <li key={scene.id}>{scene.title || "Scene"} · {scene.wordCount} words</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrashTarget({ active, visible }: { active: boolean; visible: boolean }) {
  const { setNodeRef } = useDroppable({ id: "trash" });
  if (!visible) return <div ref={setNodeRef} className="pointer-events-none fixed h-px w-px opacity-0" />;
  return (
    <div ref={setNodeRef} className={`trash-target ${active ? "active" : ""}`}>
      <p className="wordmark text-xl">Archive chapter</p>
      <p className="mt-1 text-sm text-muted-foreground">Release to archive. The chapter stays recoverable.</p>
    </div>
  );
}

function locate(parts: PartNav[], id: string) {
  for (let part = 0; part < parts.length; part += 1) {
    const index = parts[part].chapters.findIndex((chapter) => chapter.id === id);
    if (index >= 0) return { part, index };
  }
  return null;
}

function moveChapter(parts: PartNav[], activeId: string, overId: string): PartNav[] | null {
  const source = locate(parts, activeId);
  const target = locate(parts, overId);
  if (!source || !target || (source.part === target.part && source.index === target.index)) return null;
  const next = parts.map((part) => ({ ...part, chapters: part.chapters.slice() }));
  const [chapter] = next[source.part].chapters.splice(source.index, 1);
  next[target.part].chapters.splice(target.index, 0, chapter);
  return next;
}
