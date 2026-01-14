import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { Play, Pause, FileText, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerAttrs {
  src: string;
  transcript?: string;
  transcriptStatus?: 'pending' | 'processing' | 'completed' | 'error';
  duration?: number;
}

function AudioPlayerComponent({ node }: { node: { attrs: AudioPlayerAttrs } }) {
  const { src, transcript, transcriptStatus = 'completed', duration } = node.attrs;
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    const audio = document.getElementById(`audio-${src}`) as HTMLAudioElement;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setAudioDuration(e.currentTarget.duration);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = document.getElementById(`audio-${src}`) as HTMLAudioElement;
    if (audio) {
      audio.currentTime = parseFloat(e.target.value);
      setCurrentTime(parseFloat(e.target.value));
    }
  };

  return (
    <NodeViewWrapper className="my-2" data-testid="audio-player-node">
      <div className="bg-muted/50 rounded-lg border p-3 max-w-md">
        <audio
          id={`audio-${src}`}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          className="hidden"
        />

        <div className="flex items-center gap-3">
          <Button
            variant="default"
            size="icon"
            className="h-10 w-10 rounded-full flex-shrink-0"
            onClick={handlePlayPause}
            data-testid="button-play-pause"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </Button>

          <div className="flex-1 space-y-1">
            <input
              type="range"
              min="0"
              max={audioDuration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
              data-testid="audio-seek"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioDuration)}</span>
            </div>
          </div>
        </div>

        {(transcript || transcriptStatus === 'processing' || transcriptStatus === 'pending') && (
          <div className="mt-2 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-8 px-2"
              onClick={() => setShowTranscript(!showTranscript)}
              data-testid="button-toggle-transcript"
            >
              <span className="flex items-center gap-2 text-xs">
                <FileText className="w-3 h-3" />
                Transcript
                {transcriptStatus === 'processing' && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Processing...
                  </span>
                )}
                {transcriptStatus === 'pending' && (
                  <span className="text-muted-foreground">Pending</span>
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
                "mt-2 p-2 bg-background rounded text-sm",
                transcriptStatus === 'error' && "text-destructive"
              )}>
                {transcriptStatus === 'processing' ? (
                  <p className="text-muted-foreground italic">Transcription in progress...</p>
                ) : transcriptStatus === 'pending' ? (
                  <p className="text-muted-foreground italic">Waiting for transcription...</p>
                ) : transcriptStatus === 'error' ? (
                  <p>Failed to transcribe audio</p>
                ) : transcript ? (
                  <p className="whitespace-pre-wrap">{transcript}</p>
                ) : (
                  <p className="text-muted-foreground italic">No transcript available</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const AudioPlayer = Node.create({
  name: "audioPlayer",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      transcript: {
        default: null,
      },
      transcriptStatus: {
        default: 'pending',
      },
      duration: {
        default: null,
      },
      recordingId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-audio-player]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-audio-player': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioPlayerComponent);
  },
});

export function setAudioPlayer(editor: any, attrs: AudioPlayerAttrs & { recordingId?: string }) {
  return editor.chain().focus().insertContent({
    type: 'audioPlayer',
    attrs,
  }).run();
}
