import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";
import { Play, ExternalLink, Trash2, Video, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoEmbedAttributes {
  src: string;
  provider: "youtube" | "zoom" | "fathom" | "onedrive" | "unknown";
  title?: string;
  embedUrl?: string;
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
    
    // Zoom recordings
    if (urlObj.hostname.includes("zoom.us")) {
      return {
        src: url,
        provider: "zoom",
        title: "Zoom Recording",
      };
    }
    
    // Fathom - support various link formats
    if (urlObj.hostname.includes("fathom.video")) {
      // Extract video ID from various Fathom URL formats
      // https://fathom.video/share/xxxxx
      // https://fathom.video/embed/xxxxx
      // https://fathom.video/call/xxxxx
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      let videoId = "";
      
      if (pathParts.length >= 2) {
        // Get the ID after share/embed/call
        videoId = pathParts[pathParts.length - 1];
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
    
    // OneDrive / SharePoint
    if (urlObj.hostname.includes("onedrive.live.com") || 
        urlObj.hostname.includes("sharepoint.com") ||
        urlObj.hostname.includes("1drv.ms")) {
      // For OneDrive, we can convert embed URLs to download URLs for HTML5 video
      let embedUrl = url;
      
      // Convert embed URL to download URL for direct playback
      if (url.includes("embed?")) {
        embedUrl = url.replace("embed?", "download?");
      } else if (url.includes("/embed/")) {
        embedUrl = url.replace("/embed/", "/download/");
      }
      
      // For SharePoint, add action=embedview
      if (urlObj.hostname.includes("sharepoint.com") && !url.includes("action=embedview")) {
        const separator = url.includes("?") ? "&" : "?";
        embedUrl = `${url}${separator}action=embedview`;
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

function VideoEmbedComponent({ node, deleteNode, selected }: NodeViewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const { src, provider, embedUrl } = node.attrs as VideoEmbedAttributes;
  
  const thumbnail = provider === "youtube" ? getYouTubeThumbnail(src) : null;
  
  const providerIcons: Record<string, { icon: typeof Video; color: string; label: string; opensInNewTab?: boolean }> = {
    youtube: { icon: Play, color: "bg-red-600", label: "YouTube" },
    zoom: { icon: Video, color: "bg-blue-600", label: "Zoom", opensInNewTab: true },
    fathom: { icon: Video, color: "bg-purple-600", label: "Fathom", opensInNewTab: true },
    onedrive: { icon: Cloud, color: "bg-sky-600", label: "OneDrive" },
    unknown: { icon: Video, color: "bg-gray-600", label: "Video", opensInNewTab: true },
  };
  
  const providerInfo = providerIcons[provider] || providerIcons.unknown;
  const ProviderIcon = providerInfo.icon;

  // Only YouTube reliably supports iframe embedding
  // Other platforms (Fathom, Zoom) have CSP restrictions that block external embedding
  const supportsIframeEmbed = provider === "youtube" && embedUrl;
  
  // Check if this provider supports HTML5 video
  const supportsVideoTag = provider === "onedrive" && embedUrl;
  
  // Opens in new tab for platforms that block iframe embedding
  const opensInNewTab = providerInfo.opensInNewTab;

  const handlePlayClick = () => {
    if (opensInNewTab) {
      // For platforms that block iframe embedding, open in new tab
      window.open(src, '_blank', 'noopener,noreferrer');
    } else {
      setIsPlaying(true);
    }
  };

  const renderPlayButton = () => (
    <button 
      type="button"
      className="aspect-video relative cursor-pointer w-full bg-muted"
      onClick={handlePlayClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handlePlayClick();
        }
      }}
      aria-label={opensInNewTab ? `Open ${providerInfo.label} video in new tab` : `Play ${providerInfo.label} video`}
      data-testid="button-play-video"
    >
      {provider === "youtube" && thumbnail && (
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
          {opensInNewTab ? (
            <ExternalLink className="w-8 h-8 text-white" />
          ) : (
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          )}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="px-2 py-1 bg-black/60 rounded text-white text-sm font-medium">
          {providerInfo.label}
        </span>
        {opensInNewTab && (
          <span className="px-2 py-1 bg-black/60 rounded text-white/80 text-xs">
            Opens in new tab
          </span>
        )}
      </div>
    </button>
  );

  const renderIframePlayer = () => (
    <div className="aspect-video">
      <iframe
        src={provider === "youtube" ? `${embedUrl}?autoplay=1` : `${embedUrl}?autoplay=0`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title={`${providerInfo.label} video`}
      />
    </div>
  );

  const renderVideoPlayer = () => (
    <div className="aspect-video bg-black">
      {videoError ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-white gap-3">
          <Video className="w-12 h-12 opacity-50" />
          <p className="text-sm opacity-75">Unable to play video directly</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(src, '_blank')}
          >
            Open in new tab
          </Button>
        </div>
      ) : (
        <video
          src={embedUrl}
          className="w-full h-full"
          controls
          autoPlay
          onError={() => setVideoError(true)}
        >
          <source src={embedUrl} type="video/mp4" />
          Your browser does not support video playback.
        </video>
      )}
    </div>
  );

  const renderLinkCard = () => (
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
  );

  return (
    <NodeViewWrapper className="video-embed my-4">
      <div 
        className={cn(
          "relative rounded-lg overflow-hidden border bg-muted/30 group",
          selected && "ring-2 ring-primary"
        )}
        data-testid="video-embed-container"
      >
        {supportsIframeEmbed ? (
          isPlaying ? renderIframePlayer() : renderPlayButton()
        ) : supportsVideoTag ? (
          isPlaying ? renderVideoPlayer() : renderPlayButton()
        ) : (
          renderLinkCard()
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
      embedUrl: {
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
