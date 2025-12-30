import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getUserDisplayName = (user: SafeUser) => {
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return name || user.email || "Unknown";
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown && e.key === "Escape") {
      setShowMentionDropdown(false);
      setMentionStartPos(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    onChange(newValue);

    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      const hasNewline = textAfterAt.includes("\n");
      const isStartOfWord = lastAtIndex === 0 || /[\s\n]/.test(newValue[lastAtIndex - 1]);
      
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

  const handleSelectUser = (user: SafeUser) => {
    if (mentionStartPos === null) return;
    
    const displayName = getUserDisplayName(user);
    const cursorPos = textareaRef.current?.selectionStart || value.length;
    
    const before = value.slice(0, mentionStartPos);
    const after = value.slice(cursorPos);
    const newValue = before + "@" + displayName + " " + after;
    
    onChange(newValue);
    
    if (!mentionedUserIds.includes(user.id)) {
      onMentionAdd(user.id);
    }
    
    setShowMentionDropdown(false);
    setMentionStartPos(null);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStartPos + displayName.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const filteredUsers = users.filter((user) => {
    const displayName = getUserDisplayName(user).toLowerCase();
    const email = (user.email || "").toLowerCase();
    return displayName.includes(mentionSearch) || email.includes(mentionSearch);
  });

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!showMentionDropdown) {
              setIsFocused(false);
            }
          }, 150);
        }}
        placeholder={placeholder}
        className={`transition-all duration-200 resize-none ${
          isFocused || value ? "min-h-[80px]" : "min-h-[40px]"
        } ${className}`}
        rows={isFocused || value ? 3 : 1}
        data-testid={testId}
        autoFocus={autoFocus}
      />
      
      {showMentionDropdown && filteredUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-1 z-50 w-[220px] rounded-md border bg-popover shadow-md"
        >
          <Command>
            <CommandList>
              <CommandEmpty>No users found.</CommandEmpty>
              <CommandGroup>
                {filteredUsers.slice(0, 5).map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`${user.firstName} ${user.lastName} ${user.email}`}
                    onSelect={() => handleSelectUser(user)}
                    data-testid={`mention-option-${user.id}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{getUserDisplayName(user)}</span>
                      {user.email && (
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
      
      {!isFocused && !value && (
        <p className="text-xs text-muted-foreground mt-1">Type @ to mention users</p>
      )}
    </div>
  );
}
