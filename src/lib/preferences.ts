export type ThemeName = "system" | "light" | "dark" | "sepia" | "contrast";
export type EditorFont = "serif" | "sans" | "mono";

export type Shortcuts = {
  checkpoint: string;
  find: string;
  replace: string;
  palette: string;
  newChapter: string;
  focus: string;
  leftPanel: string;
  rightPanel: string;
  sceneBreak: string;
  plainPaste: string;
};

export type Preferences = {
  theme: ThemeName;
  font: EditorFont;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  writingWidth: number;
  pageMargin: number;
  firstLineIndent: boolean;
  align: "left" | "justify";
  typewriter: boolean;
  focusMode: boolean;
  distractionFree: boolean;
  spellcheck: boolean;
  language: string;
  goalWords: number | null;
  showReadingTime: boolean;
  showProgress: boolean;
  autosaveMs: number;
  shortcuts: Shortcuts;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
};

export const defaultShortcuts: Shortcuts = {
  checkpoint: "Mod+s",
  find: "Mod+f",
  replace: "Mod+h",
  palette: "Mod+k",
  newChapter: "Mod+Alt+n",
  focus: "Mod+Shift+f",
  leftPanel: "Mod+Alt+1",
  rightPanel: "Mod+Alt+2",
  sceneBreak: "Mod+Enter",
  plainPaste: "Mod+Shift+v",
};

export const defaultPreferences: Preferences = {
  theme: "system",
  font: "serif",
  fontSize: 19,
  lineHeight: 1.7,
  paragraphSpacing: 0,
  writingWidth: 720,
  pageMargin: 64,
  firstLineIndent: true,
  align: "left",
  typewriter: false,
  focusMode: false,
  distractionFree: false,
  spellcheck: true,
  language: "en",
  goalWords: null,
  showReadingTime: true,
  showProgress: false,
  autosaveMs: 1500,
  shortcuts: defaultShortcuts,
  leftOpen: true,
  rightOpen: true,
  leftWidth: 280,
  rightWidth: 320,
};

export function mergePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  const incoming = value as Partial<Preferences>;
  return {
    ...defaultPreferences,
    ...incoming,
    shortcuts: { ...defaultShortcuts, ...(incoming.shortcuts ?? {}) },
    fontSize: clamp(incoming.fontSize, 14, 28, defaultPreferences.fontSize),
    lineHeight: clamp(incoming.lineHeight, 1.2, 2.4, defaultPreferences.lineHeight),
    writingWidth: clamp(incoming.writingWidth, 480, 980, defaultPreferences.writingWidth),
    autosaveMs: clamp(incoming.autosaveMs, 400, 10000, defaultPreferences.autosaveMs),
    leftWidth: clamp(incoming.leftWidth, 200, 480, defaultPreferences.leftWidth),
    rightWidth: clamp(incoming.rightWidth, 240, 520, defaultPreferences.rightWidth),
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : fallback;
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function matchesShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.find((part) => !["mod", "shift", "alt", "ctrl", "meta"].includes(part));
  if (!key) return false;
  const needMod = parts.includes("mod") || parts.includes("ctrl") || parts.includes("meta");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const mod = event.metaKey || event.ctrlKey;
  const eventKey = event.key.toLowerCase();
  return needMod === mod && needShift === event.shiftKey && needAlt === event.altKey && eventKey === key;
}
