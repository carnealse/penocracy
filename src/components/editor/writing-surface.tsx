"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect } from "react";
import { editorExtensions } from "@/components/editor/extensions";
import type { Preferences } from "@/lib/preferences";

export function WritingSurface({
  content,
  preferences,
  onReady,
  onUpdate,
}: {
  content: unknown;
  preferences: Preferences;
  onReady: (editor: Editor) => void;
  onUpdate: (editor: Editor) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions(),
    content: content as object,
    editorProps: {
      attributes: {
        class: "writing-prose",
        spellcheck: preferences.spellcheck ? "true" : "false",
        lang: preferences.language,
      },
    },
    onUpdate: ({ editor: current }) => onUpdate(current),
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  const font =
    preferences.font === "sans"
      ? "var(--font-sans), sans-serif"
      : preferences.font === "mono"
        ? "var(--font-manuscript), monospace"
        : "var(--font-serif), serif";

  return (
    <article
      className="writing-page mx-auto"
      style={{
        width: `min(100%, ${preferences.writingWidth}px)`,
        padding: `${preferences.pageMargin}px`,
        fontFamily: font,
        fontSize: preferences.fontSize,
        lineHeight: preferences.lineHeight,
        textAlign: preferences.align,
        ["--paragraph-space" as string]: `${preferences.paragraphSpacing}px`,
      }}
    >
      <EditorContent editor={editor} />
    </article>
  );
}
