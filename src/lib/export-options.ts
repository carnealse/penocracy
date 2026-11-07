export type ExportPresetName = "manuscript" | "paperback" | "ebook" | "custom";
export type TrimSize = "5x8" | "5.5x8.5" | "6x9" | "a4" | "letter" | "custom";

export type ExportOptions = {
  format: "PDF" | "EPUB" | "DOCX";
  preset: ExportPresetName;
  trim: TrimSize;
  customWidthIn: number;
  customHeightIn: number;
  marginIn: number;
  gutterIn: number;
  mirrored: boolean;
  fontSize: number;
  lineHeight: number;
  indent: boolean;
  justify: boolean;
  includeFront: boolean;
  includeBack: boolean;
  numbering: boolean;
  blankChapterPages: boolean;
  header: boolean;
  pageNumbers: boolean;
  chapterIds: string[] | null;
  font: "serif" | "mono";
};

export const presetDefaults: Record<ExportPresetName, ExportOptions> = {
  manuscript: {
    format: "PDF",
    preset: "manuscript",
    trim: "letter",
    customWidthIn: 8.5,
    customHeightIn: 11,
    marginIn: 1,
    gutterIn: 0,
    mirrored: false,
    fontSize: 12,
    lineHeight: 2,
    indent: true,
    justify: false,
    includeFront: true,
    includeBack: true,
    numbering: true,
    blankChapterPages: false,
    header: true,
    pageNumbers: true,
    chapterIds: null,
    font: "mono",
  },
  paperback: {
    format: "PDF",
    preset: "paperback",
    trim: "6x9",
    customWidthIn: 6,
    customHeightIn: 9,
    marginIn: 0.75,
    gutterIn: 0.2,
    mirrored: true,
    fontSize: 11,
    lineHeight: 1.45,
    indent: true,
    justify: true,
    includeFront: true,
    includeBack: true,
    numbering: true,
    blankChapterPages: true,
    header: true,
    pageNumbers: true,
    chapterIds: null,
    font: "serif",
  },
  ebook: {
    format: "EPUB",
    preset: "ebook",
    trim: "5.5x8.5",
    customWidthIn: 5.5,
    customHeightIn: 8.5,
    marginIn: 0.7,
    gutterIn: 0,
    mirrored: false,
    fontSize: 12,
    lineHeight: 1.5,
    indent: true,
    justify: false,
    includeFront: true,
    includeBack: true,
    numbering: true,
    blankChapterPages: false,
    header: false,
    pageNumbers: false,
    chapterIds: null,
    font: "serif",
  },
  custom: {
    format: "PDF",
    preset: "custom",
    trim: "custom",
    customWidthIn: 6,
    customHeightIn: 9,
    marginIn: 0.8,
    gutterIn: 0.15,
    mirrored: true,
    fontSize: 11,
    lineHeight: 1.5,
    indent: true,
    justify: true,
    includeFront: true,
    includeBack: true,
    numbering: true,
    blankChapterPages: true,
    header: true,
    pageNumbers: true,
    chapterIds: null,
    font: "serif",
  },
};

export function resolveExportOptions(input: unknown): ExportOptions {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<ExportOptions>;
  const preset = isPreset(raw.preset) ? raw.preset : "paperback";
  const base = presetDefaults[preset];
  const format = raw.format === "EPUB" || raw.format === "DOCX" || raw.format === "PDF" ? raw.format : base.format;
  return {
    ...base,
    ...raw,
    preset,
    format,
    chapterIds: Array.isArray(raw.chapterIds) ? raw.chapterIds.filter((id) => typeof id === "string") : base.chapterIds,
  };
}

function isPreset(value: unknown): value is ExportPresetName {
  return value === "manuscript" || value === "paperback" || value === "ebook" || value === "custom";
}

export function trimInches(options: ExportOptions): { width: number; height: number; paper?: string } {
  switch (options.trim) {
    case "5x8":
      return { width: 5, height: 8 };
    case "5.5x8.5":
      return { width: 5.5, height: 8.5 };
    case "6x9":
      return { width: 6, height: 9 };
    case "a4":
      return { width: 8.27, height: 11.69, paper: "a4" };
    case "letter":
      return { width: 8.5, height: 11, paper: "us-letter" };
    default:
      return { width: options.customWidthIn, height: options.customHeightIn };
  }
}
