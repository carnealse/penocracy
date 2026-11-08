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

const FRONT_SLOTS = ["Copyright", "Dedication", "Epigraph", "Table of Contents", "Foreword", "Preface", "Acknowledgments", "Prologue"];
const BACK_SLOTS = ["Notes", "About the Author"];

export function ChapterTree({
  parts,
  activeId,
  authorName,
  onOpen,
  onReorder,
  onArchive,
  onDestroy,
  onRename,
  onAdd,
  onDuplicate,
}: {
  parts: PartNav[];
  activeId: string | null;
  authorName: string | null;
  onOpen: (id: string) => void;
  onReorder: (parts: PartNav[]) => void;
  onArchive: (chapter: ChapterNav) => void;
  onDestroy: (chapter: ChapterNav) => void;
  onRename: (chapter: ChapterNav, title: string) => void;
  onAdd: (partId: string, title?: string) => void;
  onDuplicate: (chapterId: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDrop, setOverDrop] = useState<string | null>(null);
  const [editing, setEditing] = useState<"FRONT" | "BACK" | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragging = useMemo(() => parts.flatMap((part) => part.chapters).find((chapter) => chapter.id === draggingId), [parts, draggingId]);
  const body = parts.find((part) => part.kind === "BODY");

  function onDragEnd(event: DragEndEvent) {
    const current = dragging;
    setDraggingId(null);
    setOverDrop(null);
    if (!current || !event.over) return;
    if (event.over.id === "archive-drop") {
      onArchive(current);
      return;
    }
    if (event.over.id === "destroy-drop") {
      onDestroy(current);
      return;
    }
    const overId = String(event.over.id);
    if (overId.startsWith("part:")) {
      const next = moveChapterToPart(parts, current.id, overId.slice(5));
      if (next) onReorder(next);
      return;
    }
    const next = moveChapter(parts, current.id, overId);
    if (next) onReorder(next);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const pointer = pointerWithin(args);
        const dock = pointer.find((hit) => hit.id === "archive-drop" || hit.id === "destroy-drop");
        if (dock) return [dock];
        const partHit = pointer.find((hit) => String(hit.id).startsWith("part:"));
        if (partHit) return [partHit];
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) => container.id !== "archive-drop" && container.id !== "destroy-drop"),
        });
      }}
      onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
      onDragOver={(event) => {
        const id = event.over?.id;
        setOverDrop(id === "archive-drop" || id === "destroy-drop" ? String(id) : null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setDraggingId(null); setOverDrop(null); }}
    >
      <div className="manuscript-nav">
        <div className="nav-header">
          <h2>Manuscript</h2>
          <button type="button" className="nav-add" onClick={() => body && onAdd(body.id)} disabled={!body}>
            Add <span aria-hidden="true">+</span>
          </button>
        </div>
        <div className="nav-scroll">
          {parts.map((part) => (
            <PartBlock
              key={part.id}
              part={part}
              activeId={activeId}
              editing={editing === part.kind}
              authorName={authorName}
              onToggleEdit={() => setEditing((current) => current === part.kind ? null : part.kind === "FRONT" || part.kind === "BACK" ? part.kind : null)}
              onOpen={onOpen}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDestroy={onDestroy}
              onAdd={onAdd}
            />
          ))}
        </div>
      </div>
      {draggingId && <div className="dim-layer" />}
      <DropDock visible={!!draggingId} overId={overDrop} />
      <DragOverlay>
        {dragging && <div className="nav-overlay">{dragging.title}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function PartBlock({
  part,
  activeId,
  editing,
  authorName,
  onToggleEdit,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDestroy,
  onAdd,
}: {
  part: PartNav;
  activeId: string | null;
  editing: boolean;
  authorName: string | null;
  onToggleEdit: () => void;
  onOpen: (id: string) => void;
  onRename: (chapter: ChapterNav, title: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (chapter: ChapterNav) => void;
  onDestroy: (chapter: ChapterNav) => void;
  onAdd: (partId: string, title?: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `part:${part.id}` });
  const label = part.kind === "FRONT" ? "Front matter" : part.kind === "BACK" ? "Back matter" : "Body";
  const slots = part.kind === "FRONT" ? FRONT_SLOTS : part.kind === "BACK" ? [...BACK_SLOTS, `Also by ${authorName || "the Author"}`] : [];
  const bodyNumbers = new Map(part.kind === "BODY" ? part.chapters.map((chapter, index) => [chapter.id, String(index + 1)]) : []);

  return (
    <section ref={setNodeRef} className={isOver ? "nav-part over" : "nav-part"}>
      <div className="nav-part-head">
        <span>{label}</span>
        {part.kind === "BODY" ? (
          <button type="button" onClick={() => onAdd(part.id)}>+ Chapter</button>
        ) : (
          <button type="button" onClick={onToggleEdit}>{editing ? "done" : "edit"}</button>
        )}
      </div>
      {editing && (
        <ul className="nav-slots">
          {slots.map((title) => {
            const existing = part.chapters.find((chapter) => chapter.title === title);
            return (
              <li key={title}>
                <span>{title}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!existing}
                  className={existing ? "slot-switch on" : "slot-switch"}
                  onClick={() => existing ? onArchive(existing) : onAdd(part.id, title)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <SortableContext items={part.chapters.map((chapter) => chapter.id)} strategy={verticalListSortingStrategy}>
        {part.chapters.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              number={bodyNumbers.get(chapter.id) ?? null}
              active={chapter.id === activeId}
              onOpen={() => onOpen(chapter.id)}
              onRename={(title) => onRename(chapter, title)}
              onDuplicate={() => onDuplicate(chapter.id)}
              onArchive={() => onArchive(chapter)}
              onDestroy={() => onDestroy(chapter)}
            />
          ))}
      </SortableContext>
      {part.kind === "BACK" && part.chapters.length === 0 && <p className="nav-drop-hint">Drag chapters here</p>}
    </section>
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
  onDestroy,
}: {
  chapter: ChapterNav;
  number: string | null;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDestroy: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: chapter.id });
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={active ? "nav-row active" : "nav-row"}>
      <button type="button" className="nav-row-main" onClick={onOpen}>
        <span className="nav-number">{number ?? ""}</span>
        <span className="nav-title">{chapter.title}</span>
      </button>
      <button type="button" className="nav-grip" aria-label={`Move ${chapter.title}`} {...attributes} {...listeners} onClick={() => setMenu((open) => !open)}>⋮⋮</button>
      {menu && (
        <form className="nav-menu" onSubmit={(event) => { event.preventDefault(); onRename(title); setMenu(false); }}>
          <input aria-label="Chapter title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button type="submit">Rename</button>
          <button type="button" onClick={() => { onDuplicate(); setMenu(false); }}>Duplicate</button>
          <button type="button" onClick={() => { onArchive(); setMenu(false); }}>Archive</button>
          <button type="button" onClick={() => { onDestroy(); setMenu(false); }}>Delete for good</button>
        </form>
      )}
    </div>
  );
}

function DropDock({ visible, overId }: { visible: boolean; overId: string | null }) {
  const archive = useDroppable({ id: "archive-drop" });
  const destroy = useDroppable({ id: "destroy-drop" });
  if (!visible) {
    return (
      <>
        <div ref={archive.setNodeRef} className="pointer-events-none fixed h-px w-px opacity-0" />
        <div ref={destroy.setNodeRef} className="pointer-events-none fixed h-px w-px opacity-0" />
      </>
    );
  }
  return (
    <div className="drop-dock">
      <div ref={archive.setNodeRef} className={overId === "archive-drop" ? "drop-spot active" : "drop-spot"}>
        <p>Archive</p>
        <span>Keep it for later recovery</span>
      </div>
      <div ref={destroy.setNodeRef} className={overId === "destroy-drop" ? "drop-spot danger active" : "drop-spot danger"}>
        <p>Delete for good</p>
        <span>This cannot be undone</span>
      </div>
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

function moveChapterToPart(parts: PartNav[], chapterId: string, partId: string): PartNav[] | null {
  const source = locate(parts, chapterId);
  const partIndex = parts.findIndex((part) => part.id === partId);
  if (!source || partIndex < 0 || source.part === partIndex) return null;
  const next = parts.map((part) => ({ ...part, chapters: part.chapters.slice() }));
  const [chapter] = next[source.part].chapters.splice(source.index, 1);
  next[partIndex].chapters.push(chapter);
  return next;
}
