import { Mark, mergeAttributes, Node } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { newId } from "@/lib/document";

export const Scene = Node.create({
  name: "scene",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      id: { default: null },
      title: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "section[data-scene]" }],
  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-scene": HTMLAttributes.id, class: "scene-block" }), 0];
  },
});

export const SceneBreak = Node.create({
  name: "sceneBreak",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "div[data-scene-break]" }],
  renderHTML() {
    return ["div", { "data-scene-break": "true", class: "scene-break" }, "* * *"];
  },
});

export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      text: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "sup[data-footnote]" }],
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { "data-footnote": HTMLAttributes.id, class: "footnote-chip" }), "*"];
  },
});

export const Comment = Mark.create({
  name: "comment",
  inclusive: false,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-comment": HTMLAttributes.id }), 0];
  },
});

export const Bookmark = Mark.create({
  name: "bookmark",
  addAttributes() {
    return { id: { default: null }, label: { default: "" } };
  },
  parseHTML: () => [{ tag: "span[data-bookmark]" }],
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-bookmark": HTMLAttributes.id }), 0];
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    manuscript: {
      insertSceneBreak: () => ReturnType;
      insertFootnote: (text: string) => ReturnType;
    };
  }
}

export function editorExtensions() {
  return [
    StarterKit.configure({ code: false, codeBlock: false, dropcursor: { color: "#7c2f24", width: 2 } }),
    Underline,
    Subscript,
    Superscript,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Typography,
    Placeholder.configure({
      showOnlyCurrent: false,
      placeholder: ({ editor, node, pos }) => {
        if (node.type.name !== "paragraph") return "";
        if (editor.state.doc.textContent.trim().length > 0) return "";
        let first = true;
        editor.state.doc.descendants((child, childPos) => {
          if (child.type.name !== "paragraph") return true;
          first = childPos === pos;
          return false;
        });
        return first ? "Begin the chapter…" : "";
      },
    }),
    Scene,
    SceneBreak,
    Footnote,
    Comment,
    Bookmark,
  ];
}

export function footnoteNode(text: string) {
  return { type: "footnote", attrs: { id: newId(), text } };
}
