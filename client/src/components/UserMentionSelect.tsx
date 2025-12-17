import { useState } from "react";
import { Check, ChevronsUpDown, AtSign, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { SafeUser } from "@shared/schema";

interface UserMentionSelectProps {
  users: SafeUser[];
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  testIdPrefix?: string;
}

export function UserMentionSelect({
  users,
  selectedUserIds,
  onSelectionChange,
  testIdPrefix = "mention",
}: UserMentionSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onSelectionChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onSelectionChange([...selectedUserIds, userId]);
    }
  };

  const removeUser = (userId: string) => {
    onSelectionChange(selectedUserIds.filter((id) => id !== userId));
  };

  const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id));

  const getUserDisplayName = (user: SafeUser) => {
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return name || user.email || "Unknown";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AtSign className="w-4 h-4" />
        <span>Tag users:</span>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {selectedUsers.map((user) => (
          <Badge
            key={user.id}
            variant="secondary"
            className="pr-1 gap-1"
            data-testid={`${testIdPrefix}-selected-${user.id}`}
          >
            {getUserDisplayName(user)}
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={() => removeUser(user.id)}
              data-testid={`${testIdPrefix}-remove-${user.id}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
        
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 border-dashed"
              data-testid={`${testIdPrefix}-add-button`}
            >
              <AtSign className="h-3 w-3" />
              Add
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search users..." />
              <CommandList>
                <CommandEmpty>No users found.</CommandEmpty>
                <CommandGroup>
                  {users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={`${user.firstName} ${user.lastName} ${user.email}`}
                      onSelect={() => toggleUser(user.id)}
                      data-testid={`${testIdPrefix}-option-${user.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedUserIds.includes(user.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {getUserDisplayName(user)}
                        </span>
                        {user.email && (
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
