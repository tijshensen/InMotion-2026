"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { useCallback, useEffect, useState } from "react";
import { MediaPicker, type MediaItem } from "@/components/media-picker";

type Props = {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** When set, Image toolbar opens the media library for this site */
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
        "rounded px-2 py-1 text-xs font-medium transition-colors",
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
  onOpenMedia,
  hasMediaLibrary,
}: {
  editor: Editor;
  onOpenMedia: () => void;
  hasMediaLibrary: boolean;
}) {
  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: "_blank" })
      .run();
  }, [editor]);

  const addImageUrl = useCallback(() => {
    const url = window.prompt("Image URL (or use Media library from Image button)");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
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

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <ToolbarButton
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
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

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
      <ToolbarButton
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “ ”
      </ToolbarButton>
      <ToolbarButton
        title="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        {"</>"}
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <ToolbarButton
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ⬅
      </ToolbarButton>
      <ToolbarButton
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ↔
      </ToolbarButton>
      <ToolbarButton
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ➡
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-slate-200" />

      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={setLink}
      >
        Link
      </ToolbarButton>
      <ToolbarButton
        title={hasMediaLibrary ? "Insert image from media library" : "Image URL"}
        onClick={hasMediaLibrary ? onOpenMedia : addImageUrl}
      >
        Image
      </ToolbarButton>
      {!hasMediaLibrary && (
        <ToolbarButton title="Image from URL" onClick={addImageUrl}>
          URL
        </ToolbarButton>
      )}
      {hasMediaLibrary && (
        <ToolbarButton title="Insert image from URL" onClick={addImageUrl}>
          URL
        </ToolbarButton>
      )}
      <ToolbarButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        ―
      </ToolbarButton>
      <ToolbarButton
        title="Undo"
        disabled={!editor.can().chain().focus().undo().run()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        Undo
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        disabled={!editor.can().chain().focus().redo().run()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        Redo
      </ToolbarButton>
    </div>
  );
}

export function BlockEditor({
  content,
  onChange,
  placeholder,
  siteId,
}: Props) {
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [htmlDraft, setHtmlDraft] = useState(content);
  const [mediaOpen, setMediaOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
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

  function insertMedia(asset: MediaItem) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .setImage({
        src: asset.path,
        alt: asset.alt || asset.filename,
        title: asset.filename,
      })
      .run();
    setMediaOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-2 py-1">
        <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
          <button
            type="button"
            onClick={switchToVisual}
            className={[
              "rounded px-2.5 py-1 font-medium",
              mode === "visual"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={switchToHtml}
            className={[
              "rounded px-2.5 py-1 font-medium",
              mode === "html"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            HTML
          </button>
        </div>
        <span className="text-[11px] text-slate-400">
          {mode === "visual" ? "WYSIWYG" : "Raw HTML"}
        </span>
      </div>

      {mode === "visual" ? (
        <>
          {editor && (
            <Toolbar
              editor={editor}
              hasMediaLibrary={Boolean(siteId)}
              onOpenMedia={() => setMediaOpen(true)}
            />
          )}
          <EditorContent editor={editor} />
        </>
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

      {siteId && (
        <MediaPicker
          open={mediaOpen}
          siteId={siteId}
          onClose={() => setMediaOpen(false)}
          onSelect={insertMedia}
        />
      )}
    </div>
  );
}
