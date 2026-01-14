import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

export function AudioRecorder({ onRecordingComplete, onCancel, isUploading = false }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
      {!audioBlob ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-8 w-8"
            data-testid="button-cancel-recording"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex-1 flex items-center gap-2">
            {isRecording && (
              <>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-mono text-muted-foreground">
                  {formatTime(recordingTime)}
                </span>
                <div className="flex-1 flex items-center gap-1">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-1 bg-primary/60 rounded-full transition-all",
                        isRecording ? "animate-pulse" : ""
                      )}
                      style={{
                        height: `${Math.random() * 16 + 4}px`,
                        animationDelay: `${i * 0.05}s`
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {!isRecording && (
              <span className="text-sm text-muted-foreground">
                Tap the microphone to start recording
              </span>
            )}
          </div>

          <Button
            variant={isRecording ? "destructive" : "default"}
            size="icon"
            onClick={isRecording ? stopRecording : startRecording}
            className="h-10 w-10 rounded-full"
            data-testid="button-toggle-recording"
          >
            {isRecording ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            disabled={isUploading}
            className="h-8 w-8"
            data-testid="button-discard-recording"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex-1">
            <audio src={audioUrl || undefined} controls className="w-full h-8" data-testid="audio-preview" />
          </div>

          <Button
            variant="default"
            size="icon"
            onClick={handleSend}
            disabled={isUploading}
            className="h-10 w-10 rounded-full"
            data-testid="button-send-recording"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}
