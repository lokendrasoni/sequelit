import { useState, useMemo, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColumnInfo {
  name: string;
  type_name: string;
  nullable: boolean;
  is_primary_key: boolean;
}

interface Props {
  columns: ColumnInfo[];
  rows: unknown[][];
  rowsAffected: number;
  executionTimeMs: number;
  error?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  // DataBrowser-only props for row selection + cell editing
  selectedRowIndex?: number;
  onRowSelect?: (idx: number, row: Record<string, unknown>) => void;
  onCellCommit?: (row: Record<string, unknown>, colName: string, newVal: string | null) => void;
  showColumnFilters?: boolean;
}

interface EditingCell {
  rowIdx: number;
  colName: string;
  value: string;
}

export function ResultGrid({
  columns, rows, rowsAffected, executionTimeMs, error,
  onRowClick, selectedRowIndex, onRowSelect, onCellCommit, showColumnFilters,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell) editInputRef.current?.focus();
  }, [editingCell]);

  // Clear column filters when the filter row is hidden
  useEffect(() => {
    if (!showColumnFilters) setColumnFilters([]);
  }, [showColumnFilters]);

  const columnHelper = createColumnHelper<Record<string, unknown>>();

  const tableColumns = useMemo(
    () =>
      columns.map((col) =>
        columnHelper.accessor(col.name, {
          header: () => (
            <div className="flex flex-col">
              <span>{col.name}</span>
              <span className="text-[10px] text-muted-foreground font-normal">{col.type_name}</span>
            </div>
          ),
          cell: (info) => {
            const val = info.getValue();
            if (val === null || val === undefined) {
              return <span className="text-muted-foreground/50 italic text-xs">NULL</span>;
            }
            if (typeof val === "object") {
              return <span className="text-xs font-mono">{JSON.stringify(val)}</span>;
            }
            return <span className="text-xs font-mono">{String(val)}</span>;
          },
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns]
  );

  const data = useMemo(
    () =>
      rows.map((row) =>
        columns.reduce<Record<string, unknown>>((acc, col, i) => {
          acc[col.name] = row[i];
          return acc;
        }, {})
      ),
    [columns, rows]
  );

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const copyAsCsv = () => {
    const header = columns.map((c) => c.name).join(",");
    const body = rows
      .map((r) => r.map((v) => (v === null ? "" : `"${String(v).replace(/"/g, '""')}"`)).join(","))
      .join("\n");
    navigator.clipboard.writeText(`${header}\n${body}`);
  };

  const downloadCsv = () => {
    const header = columns.map((c) => c.name).join(",");
    const body = rows
      .map((r) => r.map((v) => (v === null ? "" : `"${String(v).replace(/"/g, '""')}"`)).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const commitEdit = (row: Record<string, unknown>, colName: string, value: string) => {
    const newVal = value === "" ? null : value;
    onCellCommit?.(row, colName, newVal);
    setEditingCell(null);
  };

  if (error) {
    return (
      <div className="p-3 text-xs text-destructive font-mono bg-destructive/5 border-t border-destructive/20 h-full overflow-auto">
        <p className="font-semibold mb-1">Error</p>
        <p className="whitespace-pre-wrap">{error}</p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground border-t border-border h-full flex items-center justify-center">
        {rowsAffected > 0
          ? `${rowsAffected} row(s) affected · ${executionTimeMs}ms`
          : "No results"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-t border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border shrink-0 bg-muted/30">
        <span className="text-xs text-muted-foreground">
          {table.getRowModel().rows.length} row{table.getRowModel().rows.length !== 1 ? "s" : ""} · {executionTimeMs}ms
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyAsCsv}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent"
          >
            <Copy size={11} /> Copy CSV
          </button>
          <button
            onClick={downloadCsv}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent"
          >
            <Download size={11} /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="w-10 text-right text-muted-foreground/50 px-2 py-1.5 font-mono border-b border-border border-r">#</th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left px-2 py-1.5 font-medium border-b border-border border-r whitespace-nowrap cursor-pointer select-none hover:bg-muted"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && <ChevronUp size={11} />}
                      {header.column.getIsSorted() === "desc" && <ChevronDown size={11} />}
                      {!header.column.getIsSorted() && (
                        <ChevronsUpDown size={11} className="text-muted-foreground/30" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
            {showColumnFilters && (
              <tr>
                <td className="border-b border-r border-border bg-background/60 px-1 py-0.5" />
                {table.getLeafHeaders().map((header) => (
                  <td key={header.id} className="border-b border-r border-border bg-background/60 px-1 py-0.5">
                    <input
                      value={(header.column.getFilterValue() as string) ?? ""}
                      onChange={(e) => header.column.setFilterValue(e.target.value || undefined)}
                      placeholder={`${header.column.id}…`}
                      className="w-full min-w-[60px] bg-transparent border border-border/60 rounded px-1.5 py-0.5 text-[11px] font-mono outline-none focus:border-ring placeholder:text-muted-foreground/40"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => {
              const isSelected = row.index === selectedRowIndex;
              return (
                <tr
                  key={row.id}
                  onClick={() => {
                    onRowClick?.(row.original);
                    onRowSelect?.(row.index, row.original);
                  }}
                  className={cn(
                    "transition-colors",
                    isSelected
                      ? "bg-primary/10 hover:bg-primary/15"
                      : i % 2 === 0
                        ? "bg-transparent hover:bg-accent/40"
                        : "bg-muted/20 hover:bg-accent/40",
                    (onRowClick || onRowSelect) && "cursor-pointer",
                  )}
                >
                  <td className="text-right text-muted-foreground/40 px-2 py-1 font-mono border-b border-border/50 border-r text-[10px]">
                    {i + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => {
                    const isEditing =
                      editingCell?.rowIdx === row.index &&
                      editingCell?.colName === cell.column.id;

                    return (
                      <td
                        key={cell.id}
                        className="px-2 py-1 border-b border-border/50 border-r max-w-[300px]"
                        onDoubleClick={() => {
                          if (!onCellCommit) return;
                          const raw = cell.getValue() as unknown;
                          setEditingCell({
                            rowIdx: row.index,
                            colName: cell.column.id,
                            value: raw === null || raw === undefined ? "" : String(raw),
                          });
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            className="w-full bg-background border border-ring rounded px-1 py-0 text-xs font-mono outline-none"
                            value={editingCell!.value}
                            placeholder="NULL"
                            onChange={(e) =>
                              setEditingCell((prev) => prev ? { ...prev, value: e.target.value } : null)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitEdit(row.original, cell.column.id, editingCell!.value);
                              } else if (e.key === "Escape") {
                                setEditingCell(null);
                              }
                              e.stopPropagation();
                            }}
                            onBlur={() => setEditingCell(null)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate block">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
