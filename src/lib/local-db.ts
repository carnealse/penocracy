import Dexie, { type Table } from "dexie";

export type LocalChapter = {
  id: string;
  bookId: string;
  baseRevision: number;
  content: unknown;
  hash: string;
  synced: boolean;
  updatedAt: number;
};

class PenocracyDB extends Dexie {
  chapters!: Table<LocalChapter, string>;

  constructor() {
    super("penocracy");
    this.version(1).stores({ chapters: "id, bookId, synced" });
  }
}

export const localDb = new PenocracyDB();
