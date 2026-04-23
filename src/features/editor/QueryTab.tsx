import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SqlEditor } from "./SqlEditor";
import { ResultGrid, ColumnInfo } from "./ResultGrid";
import { SavedQueriesPanel } from "./SavedQueriesPanel";
import { SaveQueryDialog } from "./SaveQueryDialog";
import { ExplainViewer } from "./ExplainViewer";
import { Tab, useTabStore } from "@/stores/tabStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { Play, History, Clock, Loader2, BookMarked, Save, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueryResult {
  columns: ColumnInfo[];
  rows: unknown[][];
  rows_affected: number;
  execution_time_ms: number;
  error?: string;
}

interface Props {
  tab: Tab;
}

type Panel = "history" | "saved" | "explain" | null;

export function QueryTab({ tab }: Props) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; sql: string; executed_at: string; duration_ms: number }[]>([]);

  const { updateTab } = useTabStore();
  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === tab.connectionId)
  );

  const runQuery = useCallback(async () => {
    if (!sql.trim() || running) return;
    setRunning(true);
    try {
      const res = await invoke<QueryResult>("run_query", {
        connectionId: tab.connectionId,
        sql,
      });
      setResult(res);
    } catch (e) {
      setResult({ columns: [], rows: [], rows_affected: 0, execution_time_ms: 0, error: String(e) });
    } finally {
      setRunning(false);
    }
  }, [sql, running, tab.connectionId]);

  const loadHistory = async () => {
    const h = await invoke<typeof history>("get_query_history", {
      connectionId: tab.connectionId,
      limit: 50,
    });
    setHistory(h);
    setPanel("history");
  };

  const togglePanel = (p: Panel) => {
    if (panel === p) { setPanel(null); return; }
    if (p === "history") { loadHistory(); return; }
    setPanel(p);
  };

  const handleSqlChange = (value: string) => {
    setSql(value);
    updateTab(tab.id, { isDirty: value.length > 0 });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        {connection && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded mr-1"
            style={{
              backgroundColor: connection.color_tag ? `${connection.color_tag}20` : undefined,
              color: connection.color_tag ?? "inherit",
              border: `1px solid ${connection.color_tag ?? "transparent"}40`,
            }}
          >
            {connection.name}
          </span>
        )}
        <button
          onClick={runQuery}
          disabled={running || !sql.trim()}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? "Running…" : "Run"}
          <span className="text-[10px] opacity-60 ml-0.5">⌘↵</span>
        </button>

        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={() => togglePanel("history")}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent",
              panel === "history" ? "text-primary bg-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <History size={12} />
            History
          </button>
          <button
            onClick={() => togglePanel("saved")}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent",
              panel === "saved" ? "text-primary bg-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookMarked size={12} />
            Saved
          </button>
          <button
            onClick={() => setSaveOpen(true)}
            disabled={!sql.trim()}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Save size={12} />
            Save
          </button>
          <button
            onClick={() => togglePanel("explain")}
            disabled={!sql.trim()}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent disabled:opacity-40",
              panel === "explain" ? "text-yellow-500 bg-accent" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap size={12} />
            Explain
          </button>
        </div>

        {result && !result.error && (
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <Clock size={11} />
            {result.execution_time_ms}ms
          </span>
        )}
      </div>

      {/* Editor + Results split */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* SQL Editor — top half */}
        <div className="h-2/5 min-h-[120px] border-b border-border overflow-hidden">
          <SqlEditor
            value={sql}
            onChange={handleSqlChange}
            onExecute={runQuery}
            dbType={connection?.db_type}
          />
        </div>

        {/* Result Grid — bottom half */}
        <div className="flex-1 overflow-hidden">
          {result ? (
            <ResultGrid
              columns={result.columns}
              rows={result.rows}
              rowsAffected={result.rows_affected}
              executionTimeMs={result.execution_time_ms}
              error={result.error}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Press <kbd className="mx-1 px-1.5 py-0.5 rounded border border-border font-mono text-[10px]">⌘↵</kbd> to run
            </div>
          )}
        </div>

        {/* Overlay panels */}
        {panel === "history" && (
          <div className="absolute inset-0 bg-background/95 z-20 flex flex-col border border-border rounded overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-sm font-medium">Query History</span>
              <button onClick={() => setPanel(null)} className="text-muted-foreground hover:text-foreground text-xs">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground p-4">No history yet.</p>
              )}
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => { setSql(h.sql); setPanel(null); }}
                  className="px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-accent text-xs"
                >
                  <p className="font-mono truncate text-foreground">{h.sql}</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {new Date(h.executed_at).toLocaleString()} · {h.duration_ms}ms
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {panel === "saved" && (
          <SavedQueriesPanel
            connectionId={tab.connectionId}
            onLoad={setSql}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === "explain" && (
          <ExplainViewer
            connectionId={tab.connectionId}
            sql={sql}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      <SaveQueryDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        sql={sql}
        connectionId={tab.connectionId}
      />
    </div>
  );
}
