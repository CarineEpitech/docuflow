import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  GripVertical,
  Trash2 
} from "lucide-react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { src: string; alt?: string; title?: string }) => ReturnType;
    };
  }
}

function ResizableImageComponent({ 
  node, 
  updateAttributes, 
  deleteNode,
  selected 
}: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const src = node.attrs.src as string;
  const alt = node.attrs.alt as string | undefined;
  const title = node.attrs.title as string | undefined;
  const width = (node.attrs.width as number) || 100;
  const alignment = (node.attrs.alignment as "left" | "center" | "right") || "center";

  const handleMouseDown = useCallback((e: React.MouseEvent, direction: "left" | "right") => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = direction === "right" 
        ? moveEvent.clientX - startX.current 
        : startX.current - moveEvent.clientX;
      
      const containerWidth = containerRef.current?.parentElement?.clientWidth || 800;
      const widthChange = (deltaX / containerWidth) * 100;
      const newWidth = Math.max(20, Math.min(100, startWidth.current + widthChange));
      updateAttributes({ width: Math.round(newWidth) });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width, updateAttributes]);

  const alignmentClasses = {
    left: "mr-auto",
    center: "mx-auto",
    right: "ml-auto",
  };

  return (
    <NodeViewWrapper 
      className="relative my-4"
      data-testid="resizable-image-wrapper"
    >
      <div
        ref={containerRef}
        className={cn(
          "relative inline-block group",
          alignmentClasses[alignment],
          selected && "ring-2 ring-primary ring-offset-2"
        )}
        style={{ width: `${width}%` }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => !isResizing && setShowControls(false)}
        data-testid="resizable-image-container"
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ""}
          title={title}
          className="w-full h-auto rounded-lg block"
          draggable={false}
          data-testid="resizable-image"
        />

        {(showControls || selected) && (
          <>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-ew-resize p-1 rounded bg-background/90 border border-border shadow-sm hover:bg-accent transition-colors"
              onMouseDown={(e) => handleMouseDown(e, "left")}
              data-testid="resize-handle-left"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>

            <div 
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize p-1 rounded bg-background/90 border border-border shadow-sm hover:bg-accent transition-colors"
              onMouseDown={(e) => handleMouseDown(e, "right")}
              data-testid="resize-handle-right"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>

            <div 
              className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/95 backdrop-blur-sm rounded-lg border border-border shadow-md p-1"
              data-testid="image-toolbar"
            >
              <button
                className={cn(
                  "p-1.5 rounded hover:bg-accent transition-colors",
                  alignment === "left" && "bg-accent"
                )}
                onClick={() => updateAttributes({ alignment: "left" })}
                title="Align left"
                data-testid="button-align-left"
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                className={cn(
                  "p-1.5 rounded hover:bg-accent transition-colors",
                  alignment === "center" && "bg-accent"
                )}
                onClick={() => updateAttributes({ alignment: "center" })}
                title="Align center"
                data-testid="button-align-center"
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                className={cn(
                  "p-1.5 rounded hover:bg-accent transition-colors",
                  alignment === "right" && "bg-accent"
                )}
                onClick={() => updateAttributes({ alignment: "right" })}
                title="Align right"
                data-testid="button-align-right"
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={deleteNode}
                title="Delete image"
                data-testid="button-delete-image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div 
              className="absolute bottom-2 right-2 bg-background/90 backdrop-blur-sm text-xs px-2 py-1 rounded border border-border text-muted-foreground"
              data-testid="image-size-indicator"
            >
              {width}%
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Node.create({
  name: "image",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: 100,
      },
      alignment: {
        default: "center",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, alignment, ...attrs } = HTMLAttributes;
    return [
      "figure",
      { 
        style: `width: ${width}%; ${alignment === "center" ? "margin: 0 auto" : alignment === "right" ? "margin-left: auto" : ""}`,
        class: "my-4"
      },
      ["img", mergeAttributes(attrs, { class: "w-full h-auto rounded-lg" })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
