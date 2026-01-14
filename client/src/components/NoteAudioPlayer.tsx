import { useState, useEffect, useRef } from "react";
import { Play, Pause, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NoteAudioPlayerProps {
  audioUrl: string;
  audioRecordingId?: string;
  transcriptStatus?: string;
  audioTranscript?: string;
  isCurrentUser?: boolean;
}

export function NoteAudioPlayer({
  audioUrl,
  audioRecordingId,
  transcriptStatus: initialStatus,
  audioTranscript: initialTranscript,
  isCurrentUser = false,
}: NoteAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [transcriptStatus, setTranscriptStatus] = useState(initialStatus);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRecordingId || (transcriptStatus !== 'processing' && transcriptStatus !== 'pending')) {
      return;
    }

    const checkTranscript = async () => {
      try {
        const res = await fetch(`/api/audio/${audioRecordingId}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.transcriptStatus === 'completed' && data.transcript) {
            setTranscript(data.transcript);
            setTranscriptStatus('completed');
          } else if (data.transcriptStatus === 'error') {
            setTranscriptStatus('error');
          }
        }
      } catch (error) {
        console.error('Error fetching transcript:', error);
      }
    };

    checkTranscript();
    const interval = setInterval(checkTranscript, 2000);
    return () => clearInterval(interval);
  }, [audioRecordingId, transcriptStatus]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <Button
          variant={isCurrentUser ? "secondary" : "default"}
          size="icon"
          className="h-8 w-8 rounded-full flex-shrink-0"
          onClick={handlePlayPause}
          data-testid="button-play-pause-note"
        >
          {isPlaying ? (
            <Pause className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3 ml-0.5" />
          )}
        </Button>

        <div className="flex-1 space-y-0.5 min-w-[120px]">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className={cn(
              "w-full h-1 rounded-lg appearance-none cursor-pointer",
              isCurrentUser ? "bg-primary-foreground/30 accent-primary-foreground" : "bg-muted-foreground/20 accent-primary"
            )}
            data-testid="audio-seek-note"
          />
          <div className={cn(
            "flex justify-between text-[10px]",
            isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {(transcript || transcriptStatus === 'processing' || transcriptStatus === 'pending') && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-between h-6 px-1 text-[10px]",
              isCurrentUser ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" : ""
            )}
            onClick={() => setShowTranscript(!showTranscript)}
            data-testid="button-toggle-note-transcript"
          >
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              Transcript
              {transcriptStatus === 'processing' && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
            </span>
            {showTranscript ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </Button>

          {showTranscript && (
            <div className={cn(
              "mt-1 p-2 rounded text-xs",
              isCurrentUser ? "bg-primary-foreground/10" : "bg-background"
            )}>
              {transcriptStatus === 'processing' ? (
                <p className="italic opacity-70">Transcription in progress...</p>
              ) : transcriptStatus === 'pending' ? (
                <p className="italic opacity-70">Waiting for transcription...</p>
              ) : transcriptStatus === 'error' ? (
                <p className="text-destructive">Failed to transcribe</p>
              ) : transcript ? (
                <p className="whitespace-pre-wrap">{transcript}</p>
              ) : (
                <p className="italic opacity-70">No transcript available</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
