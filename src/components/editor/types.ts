export type SceneNav = { id: string; title: string; wordCount: number };

export type ChapterNav = {
  id: string;
  title: string;
  wordCount: number;
  sortOrder: number;
  showHeading: boolean;
  numberMode: string;
  customNumber: string | null;
  scenes: SceneNav[];
};

export type PartNav = {
  id: string;
  title: string;
  kind: "FRONT" | "BODY" | "BACK";
  chapters: ChapterNav[];
};

export type RevisionNav = {
  id: string;
  chapterId: string | null;
  kind: string;
  label: string | null;
  wordCount: number;
  groupId: string | null;
  createdAt: string;
};

export type EditorData = {
  id: string;
  title: string;
  authorName: string | null;
  lastCursor: unknown;
  parts: PartNav[];
  activeChapter: {
    id: string;
    title: string;
    content: unknown;
    revision: number;
    wordCount: number;
    hash: string;
  } | null;
  totalWords: number;
  preferences: unknown;
  revisions: RevisionNav[];
};
