"use client";

/**
 * Lightweight HTML code editor — no external chunk loading.
 * Line numbers + monospace; always available (no CodeMirror dynamic import).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type UIEvent,
} from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  placeholder?: string;
};

export function HtmlCodeEditor({
  value,
  onChange,
  minHeight = "280px",
  placeholder = "<!-- HTML content -->",
}: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = Math.max(1, value.split("\n").length);
  const lineNos = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

  const syncScroll = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  // Keep line gutter height in sync on external value changes
  useEffect(() => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
    }
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + "  " + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }

  return (
    <div
      className="flex overflow-hidden rounded-lg border border-slate-700 bg-[#1e1e1e] text-[13px] shadow-sm focus-within:ring-2 focus-within:ring-blue-500"
      style={{ minHeight }}
    >
      <pre
        ref={preRef}
        aria-hidden
        className="m-0 select-none overflow-hidden border-r border-slate-600/60 px-2 py-3 text-right font-mono leading-[1.55] text-slate-500"
        style={{ minWidth: "2.75rem" }}
      >
        {lineNos}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className="m-0 flex-1 resize-y border-0 bg-transparent px-3 py-3 font-mono leading-[1.55] text-slate-100 outline-none placeholder:text-slate-500"
        style={
          {
            minHeight,
            tabSize: 2,
          } as CSSProperties
        }
      />
    </div>
  );
}
