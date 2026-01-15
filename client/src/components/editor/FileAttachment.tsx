import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from "@tiptap/react";
import { FileText, Download, File, Image, Video, Music, FileSpreadsheet, FileArchive, Code, Presentation } from "lucide-react";

function FileAttachmentComponent({ node }: NodeViewProps) {
  const { src, filename, filesize, filetype } = node.attrs as {
    src: string;
    filename: string;
    filesize: number;
    filetype: string;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = () => {
    const type = filetype.toLowerCase();
    if (type.includes("pdf")) {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    if (type.includes("word") || type.includes("document")) {
      return <FileText className="w-8 h-8 text-blue-500" />;
    }
    if (type.includes("excel") || type.includes("spreadsheet") || type.includes("csv")) {
      return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
    }
    if (type.includes("powerpoint") || type.includes("presentation")) {
      return <Presentation className="w-8 h-8 text-orange-500" />;
    }
    if (type.startsWith("image/")) {
      return <Image className="w-8 h-8 text-purple-500" />;
    }
    if (type.startsWith("video/")) {
      return <Video className="w-8 h-8 text-pink-500" />;
    }
    if (type.startsWith("audio/")) {
      return <Music className="w-8 h-8 text-yellow-600" />;
    }
    if (type.includes("zip") || type.includes("rar") || type.includes("tar") || type.includes("7z") || type.includes("archive")) {
      return <FileArchive className="w-8 h-8 text-amber-600" />;
    }
    if (type.includes("javascript") || type.includes("json") || type.includes("html") || type.includes("css") || type.includes("xml") || type.includes("text/plain")) {
      return <Code className="w-8 h-8 text-cyan-600" />;
    }
    return <File className="w-8 h-8 text-muted-foreground" />;
  };

  const getFileTypeLabel = () => {
    const type = filetype.toLowerCase();
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "Word";
    if (type.includes("excel") || type.includes("spreadsheet")) return "Excel";
    if (type.includes("csv")) return "CSV";
    if (type.includes("powerpoint") || type.includes("presentation")) return "PowerPoint";
    if (type.startsWith("image/")) return "Image";
    if (type.startsWith("video/")) return "Video";
    if (type.startsWith("audio/")) return "Audio";
    if (type.includes("zip") || type.includes("rar") || type.includes("7z")) return "Archive";
    if (type.includes("json")) return "JSON";
    if (type.includes("javascript")) return "JavaScript";
    if (type.includes("text/plain")) return "Text";
    const ext = filename.split('.').pop()?.toUpperCase();
    return ext || "File";
  };

  return (
    <NodeViewWrapper className="file-attachment-wrapper my-2">
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors no-underline group"
        data-testid="file-attachment"
      >
        <div className="flex-shrink-0">
          {getFileIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate text-foreground" data-testid="text-attachment-filename">
            {filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {getFileTypeLabel()} • {formatFileSize(filesize)}
          </p>
        </div>
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Download className="w-4 h-4 text-muted-foreground" />
        </div>
      </a>
    </NodeViewWrapper>
  );
}

export const FileAttachment = Node.create({
  name: "fileAttachment",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      filename: {
        default: "Document",
      },
      filesize: {
        default: 0,
      },
      filetype: {
        default: "application/octet-stream",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-file-attachment]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-file-attachment': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentComponent);
  },

  addCommands() {
    return {
      setFileAttachment:
        (options: { src: string; filename: string; filesize: number; filetype: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFileAttachment: (options: {
        src: string;
        filename: string;
        filesize: number;
        filetype: string;
      }) => ReturnType;
    };
  }
}
