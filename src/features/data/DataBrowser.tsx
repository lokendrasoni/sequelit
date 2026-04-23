import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { ResultGrid, ColumnInfo } from "@/features/editor/ResultGrid";
import { JsonSidebar } from "./JsonSidebar";
import { ImportDialog } from "./ImportDialog";
import { ExportDialog } from "./ExportDialog";
import {
  RefreshCw, ChevronLeft, ChevronRight, Filter,
  Upload, Download, Braces, Trash2, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface QueryResult {
  columns: ColumnInfo[];
  rows: unknown[][];
  rows_affected: number;
  execution_time_ms: number;
  error?: string;
}

interface TableDetail {
  columns: { name: string; is_primary_key: boolean }[];
}

const PAGE_SIZE = 100;

interface Props {
  tab: Tab;
}

export function DataBrowser({ tab }: Props) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const [showColumnFilters, setShowColumnFilters] = useState(false);

  // Row selection + edit/delete
  const [pkCols, setPkCols] = useState<string[]>([]);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: number) => {
    if (!tab.schema || !tab.table) return;
    setLoading(true);
    setSelectedRowIdx(null);
    setSelectedRow(null);
    setDeleteConfirm(false);
    setActionError(null);
    try {
      const res = await invoke<QueryResult>("fetch_table_rows", {
        connectionId: tab.connectionId,
        schema: tab.schema,
        table: tab.table,
        page: p,
        pageSize: PAGE_SIZE,
      });
      setResult(res);
    } catch (e) {
      setResult({ columns: [], rows: [], rows_affected: 0, execution_time_ms: 0, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId, tab.schema, tab.table]);

  // Load PK columns once on mount
  useEffect(() => {
    if (!tab.schema || !tab.table) return;
    invoke<TableDetail>("get_table_detail", {
      connectionId: tab.connectionId,
      schema: tab.schema,
      table: tab.table,
    }).then((detail) => {
      const pks = detail.columns.filter((c) => c.is_primary_key).map((c) => c.name);
      // Fall back to all columns if no explicit PK
      setPkCols(pks.length > 0 ? pks : detail.columns.map((c) => c.name));
    }).catch(() => setPkCols([]));
  }, [tab.connectionId, tab.schema, tab.table]);

  useEffect(() => {
    fetchData(0);
  }, [fetchData]);

  const handlePageChange = (next: number) => {
    if (next < 0) return;
    setPage(next);
    fetchData(next);
  };

  const filteredRows = result
    ? filter.trim()
      ? result.rows.filter((row) =>
          row.some((cell) =>
            cell !== null && String(cell).toLowerCase().includes(filter.toLowerCase())
          )
        )
      : result.rows
    : [];

  const handleRowSelect = (idx: number, row: Record<string, unknown>) => {
    setSelectedRowIdx(idx);
    setSelectedRow(row);
    setDeleteConfirm(false);
    setActionError(null);
  };

  const handleRowClick = (row: Record<string, unknown>) => {
    setSelectedRow(row);
    setShowJson(true);
  };

  const getPkVals = (row: Record<string, unknown>) =>
    pkCols.map((c) => (row[c] === null || row[c] === undefined ? "" : String(row[c])));

  const handleDeleteRow = async () => {
    if (!selectedRow || !tab.schema || !tab.table) return;
    try {
      await invoke("delete_table_row", {
        connectionId: tab.connectionId,
        schema: tab.schema,
        table: tab.table,
        pkCols,
        pkVals: getPkVals(selectedRow),
      });
      setDeleteConfirm(false);
      fetchData(page);
    } catch (e) {
      setActionError(String(e));
      setDeleteConfirm(false);
    }
  };

  const handleCellCommit = async (
    row: Record<string, unknown>,
    colName: string,
    newVal: string | null
  ) => {
    if (!tab.schema || !tab.table) return;
    try {
      await invoke("update_table_cell", {
        connectionId: tab.connectionId,
        schema: tab.schema,
        table: tab.table,
        pkCols,
        pkVals: getPkVals(row),
        col: colName,
        val: newVal,
      });
      fetchData(page);
    } catch (e) {
      setActionError(String(e));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <span className="text-xs font-medium text-foreground">
          {tab.schema}.{tab.table}
        </span>
        <div className="flex items-center gap-1 ml-2 flex-1 max-w-xs">
          <button
            onClick={() => setShowColumnFilters((v) => !v)}
            title="Toggle column filters"
            className={cn(
              "shrink-0 rounded p-0.5 transition-colors",
              showColumnFilters
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter size={11} />
          </button>
          <Input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedRowIdx(null);
              setSelectedRow(null);
            }}
            placeholder="Quick filter rows…"
            className="h-6 text-xs py-0"
          />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowJson((s) => !s)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Toggle JSON sidebar"
          >
            <Braces size={12} />
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Import CSV"
          >
            <Upload size={12} />
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Export CSV"
          >
            <Download size={12} />
          </button>
          <button
            onClick={() => fetchData(page)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 0 || loading}
            className="disabled:opacity-30 hover:text-foreground p-0.5"
          >
            <ChevronLeft size={14} />
          </button>
          <span>Page {page + 1}</span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={(result?.rows.length ?? 0) < PAGE_SIZE || loading}
            className="disabled:opacity-30 hover:text-foreground p-0.5"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Grid + JSON Sidebar */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        <div className="flex-1 overflow-hidden">
          {result ? (
            <ResultGrid
              columns={result.columns}
              rows={filteredRows}
              rowsAffected={result.rows_affected}
              executionTimeMs={result.execution_time_ms}
              error={result.error}
              onRowClick={handleRowClick}
              selectedRowIndex={selectedRowIdx ?? undefined}
              onRowSelect={handleRowSelect}
              onCellCommit={handleCellCommit}
              showColumnFilters={showColumnFilters}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
            </div>
          )}
        </div>

        {showJson && selectedRow && (
          <JsonSidebar row={selectedRow} onClose={() => setShowJson(false)} />
        )}
      </div>

      {/* Action bar — shown when a row is selected */}
      {selectedRow && (
        <div className={cn(
          "shrink-0 border-t border-border px-3 py-1.5 flex items-center gap-3 text-xs bg-muted/30"
        )}>
          <span className="text-muted-foreground">1 row selected</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/60 italic">Double-click a cell to edit</span>

          <div className="ml-auto flex items-center gap-2">
            {actionError && (
              <span className="text-destructive max-w-xs truncate" title={actionError}>
                {actionError}
              </span>
            )}
            {deleteConfirm ? (
              <>
                <span className="text-muted-foreground">Delete this row?</span>
                <button
                  onClick={handleDeleteRow}
                  className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/80"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs px-2 py-0.5 rounded hover:bg-accent text-muted-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setDeleteConfirm(true); setActionError(null); }}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 px-2 py-0.5 rounded hover:bg-destructive/10"
                >
                  <Trash2 size={11} /> Delete row
                </button>
                <button
                  onClick={() => { setSelectedRowIdx(null); setSelectedRow(null); }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Deselect"
                >
                  <X size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        connectionId={tab.connectionId}
        schema={tab.schema ?? ""}
        table={tab.table ?? ""}
        onImported={() => fetchData(page)}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        connectionId={tab.connectionId}
        tables={[{ schema: tab.schema ?? "", table: tab.table ?? "" }]}
      />
    </div>
  );
}
