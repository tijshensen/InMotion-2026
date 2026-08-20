"use client";

import { useEffect, useRef, useState } from "react";
import { HtmlCodeEditor } from "@/components/html-code-editor";
import {
  foldAssetSummary,
  foldHtmlAssets,
  formatFoldBytes,
  unfoldHtmlAssets,
  type FoldedAsset,
} from "@/lib/html-asset-fold";

type Props = {
  value: string;
  onChange: (fullHtml: string) => void;
  /** Re-fold when this changes (e.g. selected template id). */
  resetKey: string;
  minHeight?: string;
  placeholder?: string;
};

export function FoldedHtmlEditor({
  value,
  onChange,
  resetKey,
  minHeight = "420px",
  placeholder,
}: Props) {
  const [hideAssets, setHideAssets] = useState(true);
  const [foldedDraft, setFoldedDraft] = useState("");
  const [blocks, setBlocks] = useState<FoldedAsset[]>([]);
  const blocksRef = useRef<FoldedAsset[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const next = foldHtmlAssets(valueRef.current);
    blocksRef.current = next.blocks;
    setBlocks(next.blocks);
    setFoldedDraft(next.folded);
    setHideAssets(next.blocks.length > 0);
  }, [resetKey]);

  const summary = foldAssetSummary(blocks);
  const canFold = summary.css + summary.js > 0;

  function applyFoldFromValue(full: string) {
    const next = foldHtmlAssets(full);
    blocksRef.current = next.blocks;
    setBlocks(next.blocks);
    setFoldedDraft(next.folded);
  }

  function onToggle() {
    if (hideAssets) {
      setHideAssets(false);
      return;
    }
    applyFoldFromValue(value);
    setHideAssets(true);
  }

  function onEditorChange(text: string) {
    if (!hideAssets) {
      onChange(text);
      return;
    }
    setFoldedDraft(text);
    onChange(unfoldHtmlAssets(text, blocksRef.current));
  }

  const parts: string[] = [];
  if (summary.css) parts.push(`${summary.css} CSS`);
  if (summary.js) parts.push(`${summary.js} JS`);

  return (
    <div className="space-y-2">
      {canFold && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {hideAssets
              ? `${parts.join(" + ")} hidden (${formatFoldBytes(summary.bytes)}). Placeholders stay in the HTML; deleting one drops that block on save.`
              : "Showing full CSS and JS in the shell."}
          </p>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {hideAssets ? "Show CSS & JS" : "Hide CSS & JS"}
          </button>
        </div>
      )}
      <HtmlCodeEditor
        value={hideAssets && canFold ? foldedDraft : value}
        onChange={onEditorChange}
        minHeight={minHeight}
        placeholder={placeholder}
      />
    </div>
  );
}
