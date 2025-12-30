import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SafeUser } from "@shared/schema";

interface NoteInputProps {
  value: string;
  onChange: (value: string) => void;
  users: SafeUser[];
  mentionedUserIds: string[];
  onMentionAdd: (userId: string) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  autoFocus?: boolean;
}

export function NoteInput({
  value,
  onChange,
  users,
  mentionedUserIds,
  onMentionAdd,
  placeholder = "Add a note... (type @ to mention)",
  className = "",
  testId,
  autoFocus = false,
}: NoteInputProps) {
  const [isFocused, setIsFocused] = useState(autoFocus);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getUserDisplayName = (user: SafeUser) => {
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return name || user.email || "Unknown";
  };

  const filteredUsers = users.filter((user) => {
    const displayName = getUserDisplayName(user).toLowerCase();
    const email = (user.email || "").toLowerCase();
    return displayName.includes(mentionSearch) || email.includes(mentionSearch);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionSearch]);

  useEffect(() => {
    if (showMentionDropdown && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex, showMentionDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
        setMentionStartPos(null);
      }
    };

    if (showMentionDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMentionDropdown]);

  const getCaretPosition = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current!);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  const setCaretPosition = (pos: number) => {
    if (!editorRef.current) return;
    
    const sel = window.getSelection();
    if (!sel) return;
    
    let currentPos = 0;
    const nodeStack: Node[] = [editorRef.current];
    let node: Node | undefined;
    let foundNode: Node | null = null;
    let foundOffset = 0;
    
    while ((node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textLen = node.textContent?.length || 0;
        if (currentPos + textLen >= pos) {
          foundNode = node;
          foundOffset = pos - currentPos;
          break;
        }
        currentPos += textLen;
      } else {
        const children = node.childNodes;
        for (let i = children.length - 1; i >= 0; i--) {
          nodeStack.push(children[i]);
        }
      }
    }
    
    if (foundNode) {
      const range = document.createRange();
      range.setStart(foundNode, foundOffset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const getPlainText = () => {
    return editorRef.current?.innerText || "";
  };

  const renderFormattedContent = useCallback((text: string) => {
    const mentionRegex = /(@[\w-]+(?:\s+[\w-]+)?)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return `<span class="text-green-600 dark:text-green-400 font-medium" data-mention="true">${part}</span>`;
      }
      return part.replace(/\n/g, '<br>');
    }).join('');
  }, []);

  const updateContent = useCallback((newText: string, caretPos?: number) => {
    if (!editorRef.current) return;
    
    const formattedHtml = renderFormattedContent(newText);
    editorRef.current.innerHTML = formattedHtml || '<br>';
    
    if (caretPos !== undefined) {
      setTimeout(() => setCaretPosition(caretPos), 0);
    }
  }, [renderFormattedContent]);

  useEffect(() => {
    if (editorRef.current && value !== getPlainText()) {
      updateContent(value, value.length);
    }
  }, [value, updateContent]);

  const handleSelectUser = (user: SafeUser) => {
    if (mentionStartPos === null) return;
    
    const displayName = getUserDisplayName(user);
    const currentText = getPlainText();
    const caretPos = getCaretPosition();
    
    const before = currentText.slice(0, mentionStartPos);
    const after = currentText.slice(caretPos);
    const newText = before + "@" + displayName + " " + after;
    const newCaretPos = mentionStartPos + displayName.length + 2;
    
    onChange(newText);
    
    if (!mentionedUserIds.includes(user.id)) {
      onMentionAdd(user.id);
    }
    
    setShowMentionDropdown(false);
    setMentionStartPos(null);
    setSelectedIndex(0);
    
    setTimeout(() => {
      updateContent(newText, newCaretPos);
      editorRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showMentionDropdown || filteredUsers.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < filteredUsers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          handleSelectUser(filteredUsers[selectedIndex]);
        }
        break;
      case "Escape":
        setShowMentionDropdown(false);
        setMentionStartPos(null);
        break;
      case "Tab":
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          handleSelectUser(filteredUsers[selectedIndex]);
        }
        break;
    }
  };

  const handleInput = () => {
    const newText = getPlainText();
    const caretPos = getCaretPosition();
    
    onChange(newText);

    const textBeforeCursor = newText.slice(0, caretPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      const hasNewline = textAfterAt.includes("\n");
      const isStartOfWord = lastAtIndex === 0 || /[\s\n]/.test(newText[lastAtIndex - 1]);
      
      if (!hasNewline && isStartOfWord && textAfterAt.length < 20) {
        setMentionSearch(textAfterAt.toLowerCase());
        setMentionStartPos(lastAtIndex);
        setShowMentionDropdown(true);
        return;
      }
    }
    
    setShowMentionDropdown(false);
    setMentionStartPos(null);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!showMentionDropdown) {
        setIsFocused(false);
      }
    }, 150);
    
    const currentText = getPlainText();
    if (currentText !== value) {
      updateContent(currentText, getCaretPosition());
    }
  };

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        data-placeholder={placeholder}
        className={`min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background 
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50 overflow-auto whitespace-pre-wrap
          empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground
          transition-all duration-200 ${
            isFocused || value ? "min-h-[80px]" : "min-h-[40px]"
          } ${className}`}
        data-testid={testId}
        suppressContentEditableWarning
      />
      
      {showMentionDropdown && filteredUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 bottom-full mb-1 z-50 w-[240px] rounded-md border bg-popover shadow-md"
        >
          <ScrollArea className="max-h-[200px]">
            <div className="p-1">
              {filteredUsers.map((user, index) => (
                <div
                  key={user.id}
                  ref={(el) => (itemRefs.current[index] = el)}
                  onClick={() => handleSelectUser(user)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex flex-col cursor-pointer rounded-sm px-2 py-1.5 text-sm ${
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                  data-testid={`mention-option-${user.id}`}
                >
                  <span>{getUserDisplayName(user)}</span>
                  {user.email && (
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      
      {!isFocused && !value && (
        <p className="text-xs text-muted-foreground mt-1">Type @ to mention users</p>
      )}
    </div>
  );
}
