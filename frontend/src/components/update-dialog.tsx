import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppLanguage, UpdateInfo } from "@/types";
import { CircleAlert, Download, PackageCheck, RefreshCw, RotateCw, X } from "lucide-react";

interface UpdateDialogProps {
  open: boolean;
  language: AppLanguage;
  updateInfo: UpdateInfo | null;
  onOpenChange: (open: boolean) => void;
  onCheck: () => void;
  onDownload: () => void;
  onCancelDownload: () => void;
  onInstall: () => void;
  onSkipVersion: () => void;
}

const updateDialogCopy = {
  "zh-CN": {
    checkingTitle: "正在检查更新",
    availableTitle: "发现新版本",
    notAvailableTitle: "当前已是最新版本",
    downloadingTitle: "正在下载更新",
    downloadedTitle: "更新已准备好",
    installingTitle: "正在准备安装",
    cancelledTitle: "更新已取消",
    errorTitle: "更新失败",
    description: "MockKit 会先下载更新，下载完成后由你确认是否重启并完成安装。",
    progress: "进度",
    bytes: "已下载",
    later: "稍后",
    checkAgain: "重新检查",
    skipVersion: "跳过此版本",
    download: "更新",
    cancel: "取消",
    close: "关闭",
    complete: "重启更新",
    waiting: "正在连接 GitHub...",
    unknownSize: "计算中",
    downloaded: "已下载完成，点击重启更新后会安装新版本。",
    installing: "正在准备重启安装...",
    versionLine: (current?: string, latest?: string) =>
      current && latest ? `${current} -> ${latest}` : latest ? `最新版本 ${latest}` : "",
  },
  "en-US": {
    checkingTitle: "Checking for Updates",
    availableTitle: "Update Available",
    notAvailableTitle: "You're Up to Date",
    downloadingTitle: "Downloading Update",
    downloadedTitle: "Update Ready",
    installingTitle: "Preparing Install",
    cancelledTitle: "Update Cancelled",
    errorTitle: "Update Failed",
    description:
      "MockKit downloads the update first. After it finishes, you decide whether to restart and install it.",
    progress: "Progress",
    bytes: "Downloaded",
    later: "Later",
    checkAgain: "Check Again",
    skipVersion: "Skip This Version",
    download: "Update",
    cancel: "Cancel",
    close: "Close",
    complete: "Restart to Update",
    waiting: "Connecting to GitHub...",
    unknownSize: "Calculating",
    downloaded: "Downloaded. Restart to install the new version.",
    installing: "Preparing to restart and install...",
    versionLine: (current?: string, latest?: string) =>
      current && latest ? `${current} -> ${latest}` : latest ? `Latest ${latest}` : "",
  },
} as const;

type UpdateDialogCopy = (typeof updateDialogCopy)[keyof typeof updateDialogCopy];

function formatBytes(value?: number) {
  if (!value || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function progressValue(updateInfo: UpdateInfo | null) {
  if (!updateInfo) return 0;
  if (updateInfo.stage === "downloaded" || updateInfo.stage === "installing") return 100;
  return Math.min(100, Math.max(0, updateInfo.progress ?? 0));
}

function updateTitle(updateInfo: UpdateInfo | null, copy: UpdateDialogCopy) {
  switch (updateInfo?.stage) {
    case "available":
      return copy.availableTitle;
    case "notAvailable":
      return copy.notAvailableTitle;
    case "downloading":
      return copy.downloadingTitle;
    case "downloaded":
      return copy.downloadedTitle;
    case "installing":
      return copy.installingTitle;
    case "cancelled":
      return copy.cancelledTitle;
    case "error":
      return copy.errorTitle;
    default:
      return copy.checkingTitle;
  }
}

function UpdateIcon({ stage }: { stage?: string }) {
  const className = "size-5";
  if (stage === "available" || stage === "downloaded") return <PackageCheck className={className} />;
  if (stage === "downloading") return <Download className={className} />;
  if (stage === "error") return <CircleAlert className={className} />;
  if (stage === "cancelled") return <X className={className} />;
  return (
    <RefreshCw
      className={`${className} ${stage === "checking" || stage === "installing" ? "animate-spin" : ""}`}
    />
  );
}

export function UpdateDialog({
  open,
  language,
  updateInfo,
  onOpenChange,
  onCheck,
  onDownload,
  onCancelDownload,
  onInstall,
  onSkipVersion,
}: UpdateDialogProps) {
  const copy = updateDialogCopy[language] ?? updateDialogCopy["zh-CN"];
  const stage = updateInfo?.stage ?? "checking";
  const isBusy = stage === "checking" || stage === "downloading" || stage === "installing";
  const value = progressValue(updateInfo);
  const received = formatBytes(updateInfo?.bytesReceived);
  const expected = formatBytes(updateInfo?.bytesExpected);
  const latestLabel = updateInfo?.tagName || updateInfo?.latestVersion;
  const versionLine = copy.versionLine(updateInfo?.currentVersion, latestLabel);
  const progressDetail =
    stage === "downloading"
      ? received
        ? `${copy.bytes}: ${received}${expected ? ` / ${expected}` : ""}`
        : copy.unknownSize
      : stage === "downloaded"
        ? copy.downloaded
        : stage === "installing"
          ? copy.installing
          : "";
  const hasProgress = ["downloading", "downloaded", "installing"].includes(stage);
  const hasStatusPanel = Boolean(versionLine || progressDetail || hasProgress || stage === "checking");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (!isBusy || nextOpen ? onOpenChange(nextOpen) : undefined)}
    >
      <DialogContent
        showCloseButton={!isBusy}
        className="w-[min(380px,calc(100vw-32px))] max-w-none gap-4 overflow-hidden p-5 sm:max-w-[380px]"
      >
        <DialogHeader className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-1 pr-8">
          <div className="row-span-2 flex size-9 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel))] text-[var(--accent)]">
            <UpdateIcon stage={stage} />
          </div>
          <DialogTitle className="text-[15px] leading-5">{updateTitle(updateInfo, copy)}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {updateInfo?.message || copy.description}
          </DialogDescription>
        </DialogHeader>

        {hasStatusPanel ? (
          <div className="space-y-3 rounded-lg bg-[color-mix(in_srgb,var(--panel-2)_34%,transparent)] p-3 shadow-[inset_0_0_0_1px_var(--border-soft)]">
            {versionLine ? (
              <div className="truncate text-xs font-[660] text-[var(--text)] tabular-nums">{versionLine}</div>
            ) : null}
            {hasProgress ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-[650] text-[var(--muted)]">
                  <span>{copy.progress}</span>
                  <span className="tabular-nums">{Math.round(value)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border)_62%,transparent)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${value}%` }}
                  />
                </div>
                {progressDetail ? (
                  <div className="text-[11px] text-[var(--muted)]">{progressDetail}</div>
                ) : null}
              </div>
            ) : stage === "checking" ? (
              <div className="text-[11px] text-[var(--muted)]">{copy.waiting}</div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="pt-0">
          {stage === "available" ? (
            <>
              <Button variant="outline" onClick={onSkipVersion}>
                {copy.skipVersion}
              </Button>
              <Button onClick={onDownload}>
                <Download size={14} />
                {copy.download}
              </Button>
            </>
          ) : stage === "downloading" ? (
            <Button variant="outline" onClick={onCancelDownload}>
              {copy.cancel}
            </Button>
          ) : stage === "downloaded" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {copy.later}
              </Button>
              <Button onClick={onInstall}>
                <RotateCw size={14} />
                {copy.complete}
              </Button>
            </>
          ) : stage === "notAvailable" || stage === "cancelled" || stage === "error" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {copy.close}
              </Button>
              {stage !== "notAvailable" ? <Button onClick={onCheck}>{copy.checkAgain}</Button> : null}
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
