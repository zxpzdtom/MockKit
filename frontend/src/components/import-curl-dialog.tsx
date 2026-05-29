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
import { Textarea } from "@/components/ui/textarea";

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
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !importingCurl && onOpenChange(nextOpen)}>
      <DialogContent className="w-[min(820px,calc(100vw-56px))] max-w-[min(820px,calc(100vw-56px))] overflow-hidden bg-[color-mix(in_srgb,var(--panel)_98%,white)] sm:max-w-[820px]">
        <DialogHeader className="pr-11">
          <DialogTitle>导入 cURL</DialogTitle>
          <DialogDescription>粘贴从 DevTools 复制出来的 cURL，自动生成 Override 接口。</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3">
          <Textarea
            aria-label="cURL 内容"
            className="box-border h-[210px] min-h-[210px] max-h-[210px] w-full min-w-0 resize-none overflow-auto whitespace-pre rounded-[10px] border border-[var(--border)] bg-[#fbfbfc] p-3 font-mono text-xs leading-[19px] text-[var(--text)] shadow-[var(--control-shadow)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent),var(--control-shadow)] focus-visible:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] focus-visible:ring-0"
            placeholder={`curl 'https://example.com/api/user/profile' \\
  -H 'accept: application/json' \\
  --data-raw '{"id":1}'`}
            value={curlText}
            onChange={(event) => onCurlTextChange(event.target.value)}
          />
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
            不勾选时只导入路径和请求信息，场景会使用基础成功模板，适合不方便直接请求的接口。
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
