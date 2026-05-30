import { EditorView, type ViewUpdate, keymap, placeholder } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useMemo } from "react";

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

const CURL_PLACEHOLDER = `curl 'https://example.com/api/user/profile' \\
  -H 'accept: application/json' \\
  --data-raw '{"id":1}'`;

interface ImportCurlDialogProps {
  curlFetchResponse: boolean;
  curlText: string;
  importingCurl: boolean;
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
  onCurlFetchResponseChange,
  onCurlTextChange,
  onImport,
  onOpenChange,
  open,
}: ImportCurlDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !importingCurl && onOpenChange(nextOpen)}>
      <DialogContent
        className="w-[min(820px,calc(100vw-56px))] max-w-[min(820px,calc(100vw-56px))] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[820px]"
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
          <DialogTitle>导入 cURL</DialogTitle>
          <DialogDescription>粘贴从 DevTools 复制出来的 cURL，自动生成 Override 接口。</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3">
          <div className="curl-code-editor h-[210px]">
            <CodeMirror
              aria-label="cURL 内容"
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
              onUpdate={handleUpdate}
            />
          </div>
          <div className="flex items-center gap-[9px] text-[13px] text-[var(--text)]">
            <Checkbox
              id="curl-fetch-response"
              aria-label="请求接口并保存为场景"
              checked={curlFetchResponse}
              disabled={importingCurl}
              onCheckedChange={onCurlFetchResponseChange}
            />
            <Label className="cursor-default text-[13px] font-normal leading-5" htmlFor="curl-fetch-response">
              请求接口，并把响应体保存为新场景
            </Label>
          </div>
          <div className="text-[13px] text-[var(--muted)]">
            不勾选时只导入路径和请求信息，并生成一个 Default 场景，适合不方便直接请求的接口。
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            type="button"
            disabled={importingCurl}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" disabled={importingCurl || !curlText.trim()} onClick={onImport}>
            {importingCurl ? "导入中..." : "导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
