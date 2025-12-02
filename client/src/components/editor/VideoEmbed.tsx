import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { Play, ExternalLink, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoEmbedAttributes {
  src: string;
  provider: "youtube" | "zoom" | "fathom" | "unknown";
  title?: string;
}

function extractVideoInfo(url: string): VideoEmbedAttributes | null {
  try {
    const urlObj = new URL(url);
    
    // YouTube
    if (urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be")) {
      let videoId = "";
      if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.slice(1);
      } else {
        videoId = urlObj.searchParams.get("v") || "";
      }
      if (videoId) {
        return {
          src: url,
          provider: "youtube",
          title: "YouTube Video",
        };
      }
    }
    
    // Zoom recordings
    if (urlObj.hostname.includes("zoom.us")) {
      return {
        src: url,
        provider: "zoom",
        title: "Zoom Recording",
      };
    }
    
    // Fathom
    if (urlObj.hostname.includes("fathom.video")) {
      return {
        src: url,
        provider: "fathom",
        title: "Fathom Recording",
      };
    }
    
    return {
      src: url,
      provider: "unknown",
      title: "Video Link",
    };
  } catch {
    return null;
  }
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let videoId = "";
    
    if (urlObj.hostname.includes("youtu.be")) {
      videoId = urlObj.pathname.slice(1);
    } else if (urlObj.hostname.includes("youtube.com")) {
      videoId = urlObj.searchParams.get("v") || "";
    }
    
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
    return null;
  } catch {
    return null;
  }
}

function getYouTubeThumbnail(url: string): string | null {
  try {
    const urlObj = new URL(url);
    let videoId = "";
    
    if (urlObj.hostname.includes("youtu.be")) {
      videoId = urlObj.pathname.slice(1);
    } else if (urlObj.hostname.includes("youtube.com")) {
      videoId = urlObj.searchParams.get("v") || "";
    }
    
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}

function VideoEmbedComponent({ node, deleteNode, selected }: NodeViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { src, provider } = node.attrs as VideoEmbedAttributes;
  
  const embedUrl = provider === "youtube" ? getYouTubeEmbedUrl(src) : null;
  const thumbnail = provider === "youtube" ? getYouTubeThumbnail(src) : null;
  
  const providerIcons: Record<string, { icon: typeof Video; color: string; label: string }> = {
    youtube: { icon: Play, color: "bg-red-600", label: "YouTube" },
    zoom: { icon: Video, color: "bg-blue-600", label: "Zoom" },
    fathom: { icon: Video, color: "bg-purple-600", label: "Fathom" },
    unknown: { icon: Video, color: "bg-gray-600", label: "Video" },
  };
  
  const providerInfo = providerIcons[provider] || providerIcons.unknown;
  const ProviderIcon = providerInfo.icon;

  return (
    <NodeViewWrapper className="video-embed my-4">
      <div 
        className={cn(
          "relative rounded-lg overflow-hidden border bg-muted/30 group",
          selected && "ring-2 ring-primary"
        )}
        data-testid="video-embed-container"
      >
        {provider === "youtube" && embedUrl ? (
          isPlaying ? (
            <div className="aspect-video">
              <iframe
                src={`${embedUrl}?autoplay=1`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube video"
              />
            </div>
          ) : (
            <button 
              type="button"
              className="aspect-video relative cursor-pointer w-full"
              onClick={() => setIsPlaying(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsPlaying(true);
                }
              }}
              aria-label="Play YouTube video"
              data-testid="button-play-video"
            >
              {thumbnail && (
                <img 
                  src={thumbnail} 
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors">
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", providerInfo.color)}>
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            </button>
          )
        ) : (
          <a 
            href={src} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
            data-testid="video-link"
          >
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0", providerInfo.color)}>
              <ProviderIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground flex items-center gap-2">
                {providerInfo.label} Recording
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {src}
              </div>
            </div>
          </a>
        )}
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => window.open(src, '_blank')}
            aria-label="Open video in new tab"
            title="Open in new tab"
            data-testid="button-open-video"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={deleteNode}
            aria-label="Delete video embed"
            title="Delete"
            data-testid="button-delete-video"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      setVideoEmbed: (url: string) => ReturnType;
    };
  }
}

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  
  group: "block",
  
  atom: true,
  
  addAttributes() {
    return {
      src: {
        default: "",
      },
      provider: {
        default: "unknown",
      },
      title: {
        default: "",
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-video-embed]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-video-embed': '' })];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedComponent);
  },
  
  addCommands() {
    return {
      setVideoEmbed: (url: string) => ({ commands }) => {
        const videoInfo = extractVideoInfo(url);
        if (!videoInfo) return false;
        
        return commands.insertContent({
          type: "videoEmbed",
          attrs: videoInfo,
        });
      },
    };
  },
});

export { extractVideoInfo };
