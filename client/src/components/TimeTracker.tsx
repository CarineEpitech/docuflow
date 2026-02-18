import { useState } from "react";
import { useTimeTracker } from "@/contexts/TimeTrackerContext";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Play, Pause, Square, Clock, ChevronDown, ChevronUp, AlertCircle, Check, ChevronsUpDown, Timer, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

interface TimeTrackerProps {
  testId?: string;
  iconOnly?: boolean;
}

export function TimeTracker({ testId = "button-time-tracker-toggle", iconOnly = false }: TimeTrackerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);

  const {
    activeEntry,
    isLoadingActive,
    displayDuration,
    isRunning,
    isPaused,
    hasActiveEntry,
    projects,
    selectedProjectId,
    description,
    showIdleDialog,
    idleCountdown,
    isCapturing,
    captureError,
    startMutationPending,
    pauseMutationPending,
    resumeMutationPending,
    stopMutationPending,
    setSelectedProjectId,
    setDescription,
    handleStart,
    handlePause,
    handleResume,
    handleStop,
    handleStillWorking,
    handleNotWorking,
    handleToggleCapture,
    setShowIdleDialog,
  } = useTimeTracker();

  const activeProject = projects.find(p => p.id === activeEntry?.crmProjectId);

  if (isLoadingActive) {
    return null;
  }

  return (
    <>
    <Popover open={isExpanded} onOpenChange={setIsExpanded}>
      <PopoverTrigger asChild>
        <Button
          variant={hasActiveEntry ? (isRunning ? "default" : "secondary") : "ghost"}
          size={iconOnly ? "icon" : "sm"}
          className={`${iconOnly ? "h-8 w-8" : "gap-2"} ${isRunning ? "animate-pulse" : ""}`}
          data-testid={testId}
        >
          <Clock className="h-4 w-4" />
          {!iconOnly && (
            <>
              {hasActiveEntry ? (
                <span className="font-mono text-sm">{formatDuration(displayDuration)}</span>
              ) : (
                <span>Track Time</span>
              )}
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Time Tracker</h4>
            {hasActiveEntry && (
              <span className={`text-2xl font-mono ${isRunning ? "text-primary" : "text-muted-foreground"}`}>
                {formatDuration(displayDuration)}
              </span>
            )}
          </div>

          {!hasActiveEntry && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Select Project</label>
                <Popover open={projectSelectorOpen} onOpenChange={setProjectSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={projectSelectorOpen}
                      className="w-full justify-between"
                      data-testid="select-time-project"
                    >
                      {selectedProjectId
                        ? projects.find((p) => p.id === selectedProjectId)?.project?.name || "Unnamed Project"
                        : "Choose a project..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search projects..." />
                      <CommandList>
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          {projects.map((project) => (
                            <CommandItem
                              key={project.id}
                              value={project.project?.name || "Unnamed Project"}
                              onSelect={() => {
                                setSelectedProjectId(project.id);
                                setProjectSelectorOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedProjectId === project.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {project.project?.name || "Unnamed Project"}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Description (optional)</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on?"
                  data-testid="input-time-description"
                />
              </div>

              <Button
                onClick={() => handleStart()}
                disabled={!selectedProjectId || startMutationPending}
                className="w-full gap-2"
                data-testid="button-start-tracking"
              >
                <Play className="h-4 w-4" />
                Start Tracking
              </Button>
            </>
          )}
          {hasActiveEntry && activeEntry && (
            <>
              {(activeEntry.status === "paused" || activeEntry.status === "idle") && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {activeEntry.status === "idle"
                      ? "Timer stopped due to inactivity"
                      : "Timer is paused"}
                  </span>
                </div>
              )}

              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Working on</div>
                <div className="font-medium truncate">
                  {activeProject?.project?.name || "Unknown Project"}
                </div>
                {activeEntry.description && (
                  <div className="text-sm text-muted-foreground truncate mt-1">
                    {activeEntry.description}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                <Button
                  size="sm"
                  variant={isCapturing ? "default" : "outline"}
                  className="gap-1.5 flex-1"
                  onClick={handleToggleCapture}
                  disabled={!isRunning}
                  data-testid="button-toggle-screen-capture"
                >
                  {isCapturing ? (
                    <>
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="text-xs">Screen Sharing On</span>
                    </>
                  ) : (
                    <>
                      <MonitorOff className="h-3.5 w-3.5" />
                      <span className="text-xs">Share Screen</span>
                    </>
                  )}
                </Button>
              </div>

              {captureError && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{captureError}</span>
                </div>
              )}

              <div className="flex gap-2">
                {isRunning ? (
                  <Button
                    onClick={handlePause}
                    variant="secondary"
                    className="flex-1 gap-2"
                    disabled={pauseMutationPending}
                    data-testid="button-pause-tracking"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    onClick={handleResume}
                    className="flex-1 gap-2"
                    disabled={resumeMutationPending}
                    data-testid="button-resume-tracking"
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                )}
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="flex-1 gap-2"
                  disabled={stopMutationPending}
                  data-testid="button-stop-tracking"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>

              {isPaused && (
                <div className="text-sm text-center text-muted-foreground">
                  Timer is paused
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>

    <AlertDialog open={showIdleDialog} onOpenChange={setShowIdleDialog}>
      <AlertDialogContent data-testid="dialog-idle-check">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-amber-500" />
            Are you still working?
          </AlertDialogTitle>
          <AlertDialogDescription>
            No activity detected for the last 3 minutes. The timer will stop automatically in {idleCountdown} seconds if there's no response.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleNotWorking}
            data-testid="button-idle-no"
          >
            No, stop timer
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStillWorking}
            data-testid="button-idle-yes"
          >
            Yes, still working
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
