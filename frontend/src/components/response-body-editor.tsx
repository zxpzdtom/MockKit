import { json } from "@codemirror/lang-json";
import { foldGutter } from "@codemirror/language";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo } from "react";

type ResponseBodyEditorProps = {
  ariaLabel?: string;
  value: string;
  wrapLines: boolean;
  onBlur(): void;
  onChange(value: string): void;
};

function createFoldMarker(open: boolean) {
  const marker = document.createElement("span");
  marker.className = open ? "mockkit-fold-marker is-open" : "mockkit-fold-marker is-closed";
  marker.title = open ? "折叠" : "展开";
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

export default function ResponseBodyEditor({
  ariaLabel = "响应内容",
  value,
  wrapLines,
  onBlur,
  onChange,
}: ResponseBodyEditorProps) {
  const extensions = useMemo(
    () => [
      json(),
      foldGutter({
        markerDOM: createFoldMarker,
      }),
      ...(wrapLines ? [EditorView.lineWrapping] : []),
    ],
    [wrapLines],
  );
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (!update.docChanged) return;
      onChange(update.state.doc.toString());
    },
    [onChange],
  );

  return (
    <CodeMirror
      aria-label={ariaLabel}
      className="scroll-mask-y-direct-4"
      value={value}
      height="100%"
      basicSetup={{
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        lineNumbers: true,
      }}
      extensions={extensions}
      theme="light"
      onUpdate={handleUpdate}
      onBlur={onBlur}
    />
  );
}
