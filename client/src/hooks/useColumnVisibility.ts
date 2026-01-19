import { useState, useCallback, useEffect } from "react";

export interface ColumnConfig {
  id: string;
  label: string;
  defaultVisible?: boolean;
}

interface UseColumnVisibilityOptions {
  storageKey: string;
  columns: ColumnConfig[];
}

export function useColumnVisibility({ storageKey, columns }: UseColumnVisibilityOptions) {
  // Initialize from localStorage or defaults
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(`columnVisibility_${storageKey}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return new Set(parsed);
      } catch {
        // If parsing fails, use defaults
      }
    }
    // Default: show columns where defaultVisible is true or undefined
    return new Set(
      columns
        .filter((col) => col.defaultVisible !== false)
        .map((col) => col.id)
    );
  });

  // Persist to localStorage whenever visibility changes
  useEffect(() => {
    localStorage.setItem(
      `columnVisibility_${storageKey}`,
      JSON.stringify(Array.from(visibleColumns))
    );
  }, [visibleColumns, storageKey]);

  const toggleColumn = useCallback((columnId: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const isColumnVisible = useCallback(
    (columnId: string) => visibleColumns.has(columnId),
    [visibleColumns]
  );

  const showAllColumns = useCallback(() => {
    setVisibleColumns(new Set(columns.map((col) => col.id)));
  }, [columns]);

  const resetToDefaults = useCallback(() => {
    setVisibleColumns(
      new Set(
        columns
          .filter((col) => col.defaultVisible !== false)
          .map((col) => col.id)
      )
    );
  }, [columns]);

  return {
    visibleColumns,
    toggleColumn,
    isColumnVisible,
    showAllColumns,
    resetToDefaults,
    columns,
  };
}
