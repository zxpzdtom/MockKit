import { EditorView, type ViewUpdate, keymap, placeholder } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { AppMessages } from "../i18n";

const CURL_PLACEHOLDER = `curl 'https://example.com/api/user/profile' \\
  -H 'accept: application/json' \\
  --data-raw '{"id":1}'`;

interface ImportCurlDialogProps {
  curlFetchResponse: boolean;
  curlText: string;
  importingCurl: boolean;
  messages: AppMessages["importCurl"];
  commonMessages: AppMessages["common"];
  onCurlFetchResponseChange(value: boolean): void;
  onCurlTextChange(value: string): void;
  onImport(): void;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function ImportCurlDialog({
  curlFetchResponse,
  curlText,
  importingCurl,
  messages,
  commonMessages,
  onCurlFetchResponseChange,
  onCurlTextChange,
  onImport,
  onOpenChange,
  open,
}: ImportCurlDialogProps) {
  const editorViewRef = useRef<EditorView | null>(null);
  const importingMessage = curlFetchResponse ? messages.fetching : messages.parsing;
  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => editorViewRef.current?.focus());
  }, []);
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      placeholder(CURL_PLACEHOLDER),
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            if (importingCurl || !curlText.trim()) return true;
            onImport();
            return true;
          },
        },
      ]),
    ],
    [curlText, importingCurl, onImport],
  );
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (importingCurl || !update.docChanged) return;
      onCurlTextChange(update.state.doc.toString());
    },
    [importingCurl, onCurlTextChange],
  );

  useEffect(() => {
    if (!open || importingCurl) return;
    focusEditor();
  }, [focusEditor, importingCurl, open]);

  useEffect(() => {
    if (!open || importingCurl) return;

    const handlePaste = (event: ClipboardEvent) => {
      const view = editorViewRef.current;
      if (!view) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".curl-code-editor")) return;

      const text = event.clipboardData?.getData("text");
      if (text == null) return;
      event.preventDefault();
      event.stopPropagation();
      view.focus();
      if (text) view.dispatch(view.state.replaceSelection(text));
    };

    document.addEventListener("paste", handlePaste, true);
    return () => document.removeEventListener("paste", handlePaste, true);
  }, [importingCurl, open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !importingCurl && onOpenChange(nextOpen)}>
      <DialogContent
        className="w-[min(820px,calc(100vw-56px))] max-w-[min(820px,calc(100vw-56px))] gap-3 overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[820px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          if (!importingCurl && curlText.trim()) onImport();
        }}
      >
        <DialogHeader className="pr-11">
          <DialogTitle>{messages.title}</DialogTitle>
          <DialogDescription>{messages.description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3">
          <div className="curl-code-editor relative h-[210px]">
            <CodeMirror
              aria-label={messages.contentAria}
              className="scroll-mask-y-direct-4"
              basicSetup={{
                autocompletion: false,
                bracketMatching: true,
                closeBrackets: true,
                foldGutter: false,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                lineNumbers: true,
              }}
              editable={!importingCurl}
              extensions={extensions}
              height="100%"
              readOnly={importingCurl}
              theme="light"
              value={curlText}
              autoFocus
              onCreateEditor={(view) => {
                editorViewRef.current = view;
              }}
              onUpdate={handleUpdate}
            />
            {importingCurl ? (
              <output className="absolute inset-0 grid place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] backdrop-blur-[1px]">
                <div className="inline-flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--panel)_96%,white)] px-3 py-2 text-[13px] font-medium text-[var(--text)] shadow-[0_12px_30px_rgba(40,32,24,0.12)]">
                  <Loader2 className="animate-spin text-[var(--accent)]" size={15} />
                  {importingMessage}
                </div>
              </output>
            ) : null}
          </div>
          <div className="flex items-center gap-[9px] text-[13px] text-[var(--text)]">
            <Checkbox
              id="curl-fetch-response"
              aria-label={messages.fetchResponseAria}
              checked={curlFetchResponse}
              disabled={importingCurl}
              onCheckedChange={(value) => onCurlFetchResponseChange(value === true)}
            />
            <Label className="cursor-default text-[13px] font-normal leading-5" htmlFor="curl-fetch-response">
              {messages.fetchResponse}
            </Label>
          </div>
          <div className="text-[13px] leading-5 text-[var(--muted)]">{messages.fetchResponseHint}</div>
        </div>
        <DialogFooter className="pt-0">
          <Button
            variant="secondary"
            type="button"
            disabled={importingCurl}
            onClick={() => onOpenChange(false)}
          >
            {commonMessages.cancel}
          </Button>
          <Button
            type="button"
            aria-busy={importingCurl}
            className="min-w-[72px]"
            disabled={importingCurl || !curlText.trim()}
            onClick={onImport}
          >
            {importingCurl ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                {curlFetchResponse ? messages.requesting : messages.importing}
              </>
            ) : (
              commonMessages.import
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
