"use client";

/**
 * Lets the page canvas editor register top-bar controls
 * (device, save, settings) with AdminShell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CanvasDevice = "desktop" | "tablet" | "phone";

export type EditorChromeState = {
  device: CanvasDevice;
  setDevice: (d: CanvasDevice) => void;
  onSave: () => void;
  saving: boolean;
  saveStatus: string | null;
  showMeta: boolean;
  setShowMeta: (v: boolean | ((prev: boolean) => boolean)) => void;
  onDelete?: () => void;
};

type Ctx = {
  chrome: EditorChromeState | null;
  setChrome: (c: EditorChromeState | null) => void;
};

const EditorChromeContext = createContext<Ctx | null>(null);

export function EditorChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<EditorChromeState | null>(null);
  const value = useMemo(() => ({ chrome, setChrome }), [chrome]);
  return (
    <EditorChromeContext.Provider value={value}>
      {children}
    </EditorChromeContext.Provider>
  );
}

export function useEditorChrome() {
  const ctx = useContext(EditorChromeContext);
  if (!ctx) {
    return { chrome: null, setChrome: () => {} };
  }
  return ctx;
}

/** Register canvas controls while mounted; clears on unmount. */
export function useRegisterEditorChrome(state: EditorChromeState | null) {
  const { setChrome } = useEditorChrome();
  useEffect(() => {
    setChrome(state);
    return () => setChrome(null);
  }, [state, setChrome]);
}

export function useStableEditorChrome(
  partial: Omit<EditorChromeState, "setDevice" | "setShowMeta" | "onSave"> & {
    device: CanvasDevice;
    setDevice: (d: CanvasDevice) => void;
    setShowMeta: (v: boolean | ((prev: boolean) => boolean)) => void;
    onSave: () => void;
  },
) {
  const setDevice = useCallback(partial.setDevice, [partial.setDevice]);
  const setShowMeta = useCallback(partial.setShowMeta, [partial.setShowMeta]);
  const onSave = useCallback(partial.onSave, [partial.onSave]);

  return useMemo(
    () => ({
      device: partial.device,
      setDevice,
      onSave,
      saving: partial.saving,
      saveStatus: partial.saveStatus,
      showMeta: partial.showMeta,
      setShowMeta,
      onDelete: partial.onDelete,
    }),
    [
      partial.device,
      setDevice,
      onSave,
      partial.saving,
      partial.saveStatus,
      partial.showMeta,
      setShowMeta,
      partial.onDelete,
    ],
  );
}
