import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useState, useRef, useCallback } from "react";
import { Play, ExternalLink, Trash2, Video, Cloud, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_HEIGHT = 150;
const MAX_HEIGHT = 800;
const DEFAULT_HEIGHT = 315;

interface VideoEmbedAttributes {
  src: string;
  provider: "youtube" | "loom" | "zoom" | "fathom" | "onedrive" | "unknown";
  title?: string;
  embedUrl?: string;
  height?: number;
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
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }
    
    // Loom - convert share URL to embed URL
    // Format: https://www.loom.com/share/{VIDEO_ID} -> https://www.loom.com/embed/{VIDEO_ID}
    if (urlObj.hostname.includes("loom.com")) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      let videoId = "";
      
      // Handle /share/{id} format
      if (pathParts[0] === "share" && pathParts[1]) {
        videoId = pathParts[1];
      } else if (pathParts[0] === "embed" && pathParts[1]) {
        // Already an embed URL
        videoId = pathParts[1];
      } else if (pathParts.length === 1) {
        // Direct ID format
        videoId = pathParts[0];
      }
      
      if (videoId) {
        return {
          src: url,
          provider: "loom",
          title: "Loom Recording",
          embedUrl: `https://www.loom.com/embed/${videoId}`,
        };
      }
      
      return {
        src: url,
        provider: "loom",
        title: "Loom Recording",
      };
    }
    
    // Zoom recordings - can't embed, link only
    if (urlObj.hostname.includes("zoom.us")) {
      return {
        src: url,
        provider: "zoom",
        title: "Zoom Recording",
      };
    }
    
    // Fathom - convert share URL to embed URL
    // Format: https://fathom.video/share/{VIDEO_ID} -> https://fathom.video/embed/{VIDEO_ID}
    if (urlObj.hostname.includes("fathom.video")) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      let videoId = "";
      
      // Handle /share/{id}, /embed/{id}, /call/{id} formats
      if ((pathParts[0] === "share" || pathParts[0] === "embed" || pathParts[0] === "call") && pathParts[1]) {
        videoId = pathParts[1];
      } else if (pathParts.length === 1) {
        // Direct ID format
        videoId = pathParts[0];
      }
      
      if (videoId) {
        return {
          src: url,
          provider: "fathom",
          title: "Fathom Recording",
          embedUrl: `https://fathom.video/embed/${videoId}`,
        };
      }
      
      return {
        src: url,
        provider: "fathom",
        title: "Fathom Recording",
      };
    }
    
    // OneDrive / SharePoint / 1drv.ms
    if (urlObj.hostname.includes("onedrive.live.com") || 
        urlObj.hostname.includes("sharepoint.com") ||
        urlObj.hostname === "1drv.ms") {
      
      // For 1drv.ms short URLs, we store the original URL
      // The embed will attempt to resolve it
      let embedUrl = url;
      
      // For full onedrive.live.com URLs, we can try to create embed/download URLs
      if (urlObj.hostname.includes("onedrive.live.com")) {
        // Try to convert to embed URL with embed parameter
        if (url.includes("embed?")) {
          // Convert to download for HTML5 video playback
          embedUrl = url.replace("embed?", "download?");
        } else if (url.includes("?")) {
          // Add embed action for iframe
          embedUrl = url + "&action=embedview";
        }
      }
      
      return {
        src: url,
        provider: "onedrive",
        title: "OneDrive Video",
        embedUrl: embedUrl,
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

// Get Loom thumbnail from video ID
function getLoomThumbnail(embedUrl: string): string | null {
  try {
    const match = embedUrl.match(/\/embed\/([a-f0-9]+)/);
    if (match && match[1]) {
      return `https://cdn.loom.com/sessions/thumbnails/${match[1]}-with-play.gif`;
    }
    return null;
  } catch {
    return null;
  }
}

function VideoEmbedComponent({ node, deleteNode, selected, updateAttributes }: NodeViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { src, provider, embedUrl, height } = node.attrs as VideoEmbedAttributes;
  const currentHeight = height || DEFAULT_HEIGHT;
  
  const thumbnail = provider === "youtube" ? getYouTubeThumbnail(src) : 
                    provider === "loom" && embedUrl ? getLoomThumbnail(embedUrl) : null;
  
  const providerConfig: Record<string, { 
    icon: typeof Video; 
    color: string; 
    label: string; 
    supportsEmbed: boolean;
  }> = {
    youtube: { icon: Play, color: "bg-red-600", label: "YouTube", supportsEmbed: true },
    loom: { icon: Video, color: "bg-purple-500", label: "Loom", supportsEmbed: true },
    fathom: { icon: Video, color: "bg-violet-600", label: "Fathom", supportsEmbed: true },
    zoom: { icon: Video, color: "bg-blue-600", label: "Zoom", supportsEmbed: false },
    onedrive: { icon: Cloud, color: "bg-sky-600", label: "OneDrive", supportsEmbed: true },
    unknown: { icon: Video, color: "bg-gray-600", label: "Video", supportsEmbed: false },
  };
  
  const config = providerConfig[provider] || providerConfig.unknown;
  const ProviderIcon = config.icon;

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startY = e.clientY;
    const startHeight = currentHeight;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + deltaY));
      updateAttributes({ height: Math.round(newHeight) });
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [currentHeight, updateAttributes]);

  // Check if we can embed this video
  const canEmbed = config.supportsEmbed && embedUrl && !iframeError;

  const handlePlayClick = () => {
    if (canEmbed) {
      setIsPlaying(true);
    } else {
      // Open in new tab for providers that don't support embedding
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  const handleIframeError = () => {
    setIframeError(true);
  };

  const renderPlayButton = () => (
    <button 
      type="button"
      className="relative cursor-pointer w-full bg-muted"
      style={{ height: `${currentHeight}px` }}
      onClick={handlePlayClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePlayClick();
        }
      }}
      aria-label={canEmbed ? `Play ${config.label} video` : `Open ${config.label} video in new tab`}
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
        <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", config.color)}>
          {canEmbed ? (
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          ) : (
            <ExternalLink className="w-8 h-8 text-white" />
          )}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="px-2 py-1 bg-black/60 rounded text-white text-sm font-medium">
          {config.label}
        </span>
        {!canEmbed && (
          <span className="px-2 py-1 bg-black/60 rounded text-white/80 text-xs">
            Opens in new tab
          </span>
        )}
      </div>
    </button>
  );

  const renderIframePlayer = () => {
    // Build the iframe URL with appropriate parameters
    let iframeSrc = embedUrl || "";
    
    if (provider === "youtube") {
      iframeSrc = embedUrl + "?autoplay=1";
    } else if (provider === "loom") {
      iframeSrc = embedUrl + "?hideEmbedTopBar=true";
    } else if (provider === "fathom") {
      iframeSrc = embedUrl + "?autoplay=0";
    }
    
    return (
      <div className="relative w-full" style={{ height: `${currentHeight}px` }}>
        <iframe
          src={iframeSrc}
          className="w-full h-full absolute inset-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={`${config.label} video`}
          onError={handleIframeError}
        />
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted text-muted-foreground gap-3">
            <Video className="w-12 h-12 opacity-50" />
            <p className="text-sm">Unable to embed video</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(src, '_blank')}
            >
              Open in new tab
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderOneDrivePlayer = () => {
    // For OneDrive, try iframe embed first
    return (
      <div className="relative w-full bg-black" style={{ height: `${currentHeight}px` }}>
        <iframe
          src={embedUrl}
          className="w-full h-full absolute inset-0"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="OneDrive video"
          onError={handleIframeError}
        />
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted text-muted-foreground gap-3">
            <Cloud className="w-12 h-12 opacity-50" />
            <p className="text-sm text-center px-4">OneDrive videos may require opening in a new tab</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(src, '_blank')}
            >
              Open in new tab
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderLinkCard = () => (
    <a 
      href={src} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
      data-testid="video-link"
    >
      <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
        <ProviderIcon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground flex items-center gap-2">
          {config.label} Recording
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {src}
        </div>
      </div>
    </a>
  );

  const renderContent = () => {
    // For providers that support embedding
    if (canEmbed) {
      if (isPlaying) {
        if (provider === "onedrive") {
          return renderOneDrivePlayer();
        }
        return renderIframePlayer();
      }
      return renderPlayButton();
    }
    
    // For providers without embed support, show link card
    return renderLinkCard();
  };

  return (
    <NodeViewWrapper className="video-embed my-4">
      <div 
        ref={containerRef}
        className={cn(
          "relative rounded-lg overflow-hidden border bg-muted/30 group",
          selected && "ring-2 ring-primary",
          isResizing && "select-none"
        )}
        data-testid="video-embed-container"
      >
        {renderContent()}
        
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-1 z-10">
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
        
        {/* Resize handle */}
        <div
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/20 to-transparent"
          onMouseDown={handleResizeStart}
          data-testid="video-resize-handle"
        >
          <div className="flex items-center justify-center bg-background/80 backdrop-blur-sm rounded px-2 py-0.5">
            <GripHorizontal className="w-4 h-3 text-muted-foreground" />
          </div>
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
      embedUrl: {
        default: "",
      },
      height: {
        default: DEFAULT_HEIGHT,
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
