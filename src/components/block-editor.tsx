"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { useEffect, useState } from "react";

type Props = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Kept for callers; media insert is no longer on the compact toolbar */
  siteId?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-blue-100 text-blue-800"
          : "text-slate-600 hover:bg-slate-100",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  mode,
  onVisual,
  onHtml,
}: {
  editor: Editor | null;
  mode: "visual" | "html";
  onVisual: () => void;
  onHtml: () => void;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-px overflow-x-auto border-b border-slate-200 bg-slate-50 px-1.5 py-1">
      <div className="mr-1 flex shrink-0 rounded border border-slate-200 p-px text-[10px]">
        <button
          type="button"
          onClick={onVisual}
          className={[
            "rounded px-1.5 py-0.5 font-medium",
            mode === "visual"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          Visual
        </button>
        <button
          type="button"
          onClick={onHtml}
          className={[
            "rounded px-1.5 py-0.5 font-medium",
            mode === "html"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-white",
          ].join(" ")}
        >
          HTML
        </button>
      </div>

      {mode === "visual" && editor && (
        <>
          <ToolbarButton
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <span className="line-through">S</span>
          </ToolbarButton>

          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" />

          <ToolbarButton
            title="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            title="Paragraph"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            ¶
          </ToolbarButton>

          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" />

          <ToolbarButton
            title="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            title="Blockquote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            “
          </ToolbarButton>
          <ToolbarButton
            title="Code block"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            {"</>"}
          </ToolbarButton>
          <ToolbarButton
            title="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            ―
          </ToolbarButton>

          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" />

          <ToolbarButton
            title="Undo"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↩
          </ToolbarButton>
          <ToolbarButton
            title="Redo"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↪
          </ToolbarButton>
        </>
      )}
    </div>
  );
}

export function BlockEditor({
  content,
  onChange,
  placeholder,
}: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      // Keep these so existing HTML still renders; they are not on the toolbar
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Start writing…",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Image.configure({
        HTMLAttributes: { class: "max-w-full h-auto rounded" },
      }),
    ],
    content: content || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-editor prose prose-slate max-w-none min-h-[160px] px-3 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      setHtmlDraft(html);
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content !== current && content !== htmlDraft) {
      editor.commands.setContent(content || "", { emitUpdate: false });
      setHtmlDraft(content || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  function switchToHtml() {
    if (editor) setHtmlDraft(editor.getHTML());
    setMode("html");
  }

  function switchToVisual() {
    if (editor) {
      editor.commands.setContent(htmlDraft || "", { emitUpdate: false });
      onChange(htmlDraft);
    }
    setMode("visual");
  }

  function onHtmlChange(value: string) {
    setHtmlDraft(value);
    onChange(value);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <Toolbar
        editor={editor}
        mode={mode}
        onVisual={switchToVisual}
        onHtml={switchToHtml}
      />

      {mode === "visual" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          value={htmlDraft}
          onChange={(e) => onHtmlChange(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full resize-y border-0 px-3 py-3 font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-0"
          placeholder="HTML content"
        />
      )}
    </div>
  );
}
