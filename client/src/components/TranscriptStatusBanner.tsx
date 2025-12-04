import { useTranscriptStatus, useRetryTranscript, useSyncTranscripts } from "@/hooks/useTranscriptStatus";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Loader2, RefreshCw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TranscriptStatusBannerProps {
  documentId: string;
}

export function TranscriptStatusBanner({ documentId }: TranscriptStatusBannerProps) {
  const { data: status, isLoading } = useTranscriptStatus(documentId);
  const retryMutation = useRetryTranscript();
  const syncMutation = useSyncTranscripts();

  if (isLoading || !status || status.total === 0) {
    return null;
  }

  const isAllCompleted = status.completed === status.total;
  const hasErrors = status.error > 0;
  const isProcessing = status.pending > 0 || status.processing > 0;

  const handleRetry = (transcriptId: string) => {
    retryMutation.mutate(transcriptId);
  };

  const handleSyncAll = () => {
    syncMutation.mutate(documentId);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm mb-4",
        isAllCompleted && "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
        isProcessing && "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
        hasErrors && !isProcessing && "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
      )}
      data-testid="transcript-status-banner"
    >
      <div className="flex items-center gap-2">
        {isAllCompleted && (
          <>
            <CheckCircle className="w-4 h-4" />
            <span>Video transcripts added to knowledge base</span>
          </>
        )}
        {isProcessing && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Syncing video transcripts... ({status.completed}/{status.total})
            </span>
          </>
        )}
        {hasErrors && !isProcessing && (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>
              {status.error} of {status.total} video transcripts failed
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasErrors && (
          <div className="flex items-center gap-1">
            {status.transcripts
              .filter(t => t.status === "error")
              .map((transcript) => (
                <Tooltip key={transcript.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1"
                      onClick={() => handleRetry(transcript.id)}
                      disabled={retryMutation.isPending}
                      data-testid={`button-retry-transcript-${transcript.videoId}`}
                    >
                      <RefreshCw className={cn("w-3 h-3", retryMutation.isPending && "animate-spin")} />
                      Retry {transcript.provider}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{transcript.errorMessage || "Failed to extract transcript"}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
          </div>
        )}
        
        {isAllCompleted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1"
                onClick={handleSyncAll}
                disabled={syncMutation.isPending}
                data-testid="button-refresh-transcripts"
              >
                <RefreshCw className={cn("w-3 h-3", syncMutation.isPending && "animate-spin")} />
                Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Re-sync all video transcripts</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function TranscriptStatusCompact({ documentId }: TranscriptStatusBannerProps) {
  const { data: status, isLoading } = useTranscriptStatus(documentId);

  if (isLoading || !status || status.total === 0) {
    return null;
  }

  const isAllCompleted = status.completed === status.total;
  const hasErrors = status.error > 0;
  const isProcessing = status.pending > 0 || status.processing > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium cursor-default",
            isAllCompleted && "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
            isProcessing && "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
            hasErrors && !isProcessing && "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
          )}
          data-testid="transcript-status-compact"
        >
          {isAllCompleted && <CheckCircle className="w-3 h-3" />}
          {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
          {hasErrors && !isProcessing && <AlertCircle className="w-3 h-3" />}
          <FileText className="w-3 h-3" />
          <span>
            {isAllCompleted && "Transcripts synced"}
            {isProcessing && `Syncing ${status.completed}/${status.total}`}
            {hasErrors && !isProcessing && `${status.error} failed`}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {status.total} video transcript{status.total !== 1 ? "s" : ""} in this page
          {status.completed > 0 && `, ${status.completed} added to knowledge base`}
          {status.error > 0 && `, ${status.error} failed`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
