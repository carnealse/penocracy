export function sortTitle(title: string): string {
  const stripped = title.trim().replace(/^(a|an|the)\s+/i, "");
  return stripped.trim() || title.trim();
}

export function compareTitles(a: string, b: string): number {
  return sortTitle(a).localeCompare(sortTitle(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export type ShelfBook = {
  id: string;
  title: string;
  pinned: boolean;
  lastEditedAt: string | Date;
};

export type ShelvedBook<T extends ShelfBook> = T & { recent?: boolean };

export function organizeLibrary<T extends ShelfBook>(books: T[]): {
  top: Array<ShelvedBook<T>>;
  rest: T[];
} {
  const byRecent = [...books].sort(
    (a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime(),
  );
  const latest = byRecent[0];
  const pinned = books
    .filter((book) => book.pinned)
    .sort((a, b) => compareTitles(a.title, b.title));
  const top: Array<ShelvedBook<T>> = pinned.map((book) => ({ ...book }));
  if (latest && !latest.pinned) {
    top.push({ ...latest, recent: true });
  }
  const topIds = new Set(top.map((book) => book.id));
  const rest = books
    .filter((book) => !topIds.has(book.id))
    .sort((a, b) => compareTitles(a.title, b.title));
  const seen = new Set<string>();
  for (const book of [...top, ...rest]) {
    if (seen.has(book.id)) {
      throw new Error(`Book ${book.id} was placed on more than one shelf.`);
    }
    seen.add(book.id);
  }
  return { top, rest };
}
