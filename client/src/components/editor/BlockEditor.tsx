import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { ResizableImage } from "./ResizableImage";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Dropcursor from "@tiptap/extension-dropcursor";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Image as ImageIcon,
  Type,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

interface BlockEditorProps {
  content: any;
  onChange: (content: any) => void;
  onImageUpload?: () => Promise<string | null>;
  editable?: boolean;
}

const SLASH_COMMANDS = [
  { title: "Text", icon: Type, description: "Plain text", type: "paragraph", group: "Basic" },
  { title: "Heading 1", icon: Heading1, description: "Large heading", type: "heading", attrs: { level: 1 }, group: "Basic" },
  { title: "Heading 2", icon: Heading2, description: "Medium heading", type: "heading", attrs: { level: 2 }, group: "Basic" },
  { title: "Heading 3", icon: Heading3, description: "Small heading", type: "heading", attrs: { level: 3 }, group: "Basic" },
  { title: "Bullet List", icon: List, description: "Unordered list", type: "bulletList", group: "Lists" },
  { title: "Numbered List", icon: ListOrdered, description: "Ordered list", type: "orderedList", group: "Lists" },
  { title: "To-do List", icon: CheckSquare, description: "Task list", type: "taskList", group: "Lists" },
  { title: "Quote", icon: Quote, description: "Block quote", type: "blockquote", group: "Blocks" },
  { title: "Code Block", icon: Code, description: "Code with syntax highlighting", type: "codeBlock", group: "Blocks" },
  { title: "Divider", icon: Minus, description: "Horizontal line", type: "horizontalRule", group: "Blocks" },
  { title: "Image", icon: ImageIcon, description: "Upload or embed image", type: "image", group: "Media" },
  { title: "Callout", icon: AlertCircle, description: "Info callout box", type: "callout", group: "Blocks" },
];

export function BlockEditor({ content, onChange, onImageUpload, editable = true }: BlockEditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        dropcursor: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return `Heading ${node.attrs.level}`;
          }
          return 'Type "/" for commands...';
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TextStyle,
      Color,
      ResizableImage,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "javascript",
      }),
      Dropcursor.configure({
        color: "hsl(221, 83%, 53%)",
        width: 2,
      }),
    ],
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
    editable,
    onCreate: () => {
      setIsInitialized(true);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor outline-none min-h-[200px] prose prose-sm dark:prose-invert max-w-none",
      },
      handleKeyDown: (view, event) => {
        if (showSlashMenu) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            handleCommandSelect(filteredCommands[selectedIndex]);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setShowSlashMenu(false);
            return true;
          }
        }

        if (event.key === "/" && !showSlashMenu) {
          const { from } = view.state.selection;
          const $pos = view.state.doc.resolve(from);
          const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
          
          if (textBefore === "" || textBefore.endsWith(" ")) {
            setTimeout(() => {
              const coords = view.coordsAtPos(from);
              setSlashMenuPosition({
                top: coords.bottom + 8,
                left: coords.left,
              });
              setShowSlashMenu(true);
              setSlashFilter("");
              setSelectedIndex(0);
            }, 0);
          }
        }

        return false;
      },
    },
  });

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.title.toLowerCase().includes(slashFilter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const handleCommandSelect = useCallback(async (command: typeof SLASH_COMMANDS[0]) => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const $pos = editor.state.doc.resolve(from);
    const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
    const slashIndex = textBefore.lastIndexOf("/");
    
    if (slashIndex >= 0) {
      editor.chain().focus().deleteRange({
        from: from - (textBefore.length - slashIndex),
        to: from,
      }).run();
    }

    setShowSlashMenu(false);
    setSlashFilter("");

    switch (command.type) {
      case "paragraph":
        editor.chain().focus().setParagraph().run();
        break;
      case "heading":
        editor.chain().focus().toggleHeading({ level: command.attrs?.level as 1 | 2 | 3 }).run();
        break;
      case "bulletList":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "orderedList":
        editor.chain().focus().toggleOrderedList().run();
        break;
      case "taskList":
        editor.chain().focus().toggleTaskList().run();
        break;
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run();
        break;
      case "codeBlock":
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case "horizontalRule":
        editor.chain().focus().setHorizontalRule().run();
        break;
      case "image":
        if (onImageUpload) {
          const url = await onImageUpload();
          if (url) {
            editor.chain().focus().setImage({ src: url }).run();
          }
        }
        break;
      case "callout":
        editor.chain().focus().insertContent({
          type: "blockquote",
          content: [{ type: "paragraph" }],
        }).run();
        break;
    }
  }, [editor, onImageUpload]);

  useEffect(() => {
    if (!editor) return;

    const handleInput = () => {
      if (showSlashMenu) {
        const { from } = editor.state.selection;
        const $pos = editor.state.doc.resolve(from);
        const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
        const slashIndex = textBefore.lastIndexOf("/");
        
        if (slashIndex === -1) {
          setShowSlashMenu(false);
        } else {
          setSlashFilter(textBefore.slice(slashIndex + 1));
          setSelectedIndex(0);
        }
      }
    };

    editor.on("update", handleInput);
    return () => {
      editor.off("update", handleInput);
    };
  }, [editor, showSlashMenu]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showSlashMenu) {
        setShowSlashMenu(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showSlashMenu]);

  // Sync editor content when content prop changes (e.g., when navigating back to a page)
  useEffect(() => {
    if (!editor || !isInitialized) return;
    
    // Only update if the content is different from what's in the editor
    const currentContent = editor.getJSON();
    const newContent = content || { type: "doc", content: [{ type: "paragraph" }] };
    
    // Simple comparison - update if the stringified versions differ
    if (JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
      editor.commands.setContent(newContent, { emitUpdate: false });
    }
  }, [editor, content, isInitialized]);

  if (!editor) return null;

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {} as Record<string, typeof SLASH_COMMANDS>);

  return (
    <div className="relative" data-testid="block-editor">
      <div className="sticky top-0 z-10 bg-background border-b border-border mb-4 -mx-6 px-6 py-2 flex items-center gap-1 flex-wrap" data-testid="editor-toolbar">
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("bold") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-testid="button-bold"
        >
          <Bold className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("italic") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-testid="button-italic"
        >
          <Italic className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("underline") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-testid="button-underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("strike") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          data-testid="button-strike"
        >
          <Strikethrough className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("highlight") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          data-testid="button-highlight"
        >
          <Highlighter className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("code") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          data-testid="button-code"
        >
          <Code className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("heading", { level: 1 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          data-testid="button-h1"
        >
          <Heading1 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("heading", { level: 2 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          data-testid="button-h2"
        >
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("heading", { level: 3 }) && "bg-accent")}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          data-testid="button-h3"
        >
          <Heading3 className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("bulletList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-testid="button-bullet-list"
        >
          <List className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("orderedList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          data-testid="button-ordered-list"
        >
          <ListOrdered className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("taskList") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          data-testid="button-task-list"
        >
          <CheckSquare className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("blockquote") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          data-testid="button-blockquote"
        >
          <Quote className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", editor.isActive("codeBlock") && "bg-accent")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          data-testid="button-code-block"
        >
          <Code className="w-4 h-4" />
        </Button>
      </div>

      <EditorContent editor={editor} />

      {showSlashMenu && filteredCommands.length > 0 && (
        <div
          className="slash-menu fixed z-50"
          style={{ top: slashMenuPosition.top, left: slashMenuPosition.left }}
          onClick={(e) => e.stopPropagation()}
          data-testid="slash-menu"
        >
          {Object.entries(groupedCommands).map(([group, commands]) => (
            <div key={group}>
              <div className="slash-menu-group">{group}</div>
              {commands.map((cmd) => {
                const globalIdx = filteredCommands.indexOf(cmd);
                return (
                  <button
                    key={cmd.title}
                    className={cn(
                      "slash-menu-item w-full",
                      globalIdx === selectedIndex && "selected"
                    )}
                    onClick={() => handleCommandSelect(cmd)}
                    data-testid={`slash-command-${cmd.type}`}
                  >
                    <cmd.icon className="slash-menu-item-icon" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{cmd.title}</p>
                      <p className="text-xs text-muted-foreground">{cmd.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
