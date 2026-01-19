import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ColumnConfig } from "@/hooks/useColumnVisibility";

interface ColumnVisibilityDropdownProps {
  columns: ColumnConfig[];
  visibleColumns: Set<string>;
  toggleColumn: (columnId: string) => void;
  resetToDefaults: () => void;
}

export function ColumnVisibilityDropdown({
  columns,
  visibleColumns,
  toggleColumn,
  resetToDefaults,
}: ColumnVisibilityDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          data-testid="button-column-visibility"
        >
          <Columns3 className="w-4 h-4" />
          <span className="hidden sm:inline">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="flex items-center justify-between">
          Toggle Columns
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.preventDefault();
              resetToDefaults();
            }}
            data-testid="button-reset-columns"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visibleColumns.has(column.id)}
            onCheckedChange={() => toggleColumn(column.id)}
            data-testid={`checkbox-column-${column.id}`}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
