import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { RefreshCw, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PgActivity {
  pid: number;
  usename: string;
  application_name: string;
  client_addr: string | null;
  state: string | null;
  wait_event: string | null;
  wait_event_type: string | null;
  query: string | null;
  duration_sec: number | null;
}

const STATE_COLOR: Record<string, string> = {
  active: "text-green-500",
  idle: "text-muted-foreground",
  "idle in transaction": "text-yellow-500",
  "idle in transaction (aborted)": "text-red-500",
};

const REFRESH_MS = 3000;

interface Props {
  tab: Tab;
}

export function ActivityMonitor({ tab }: Props) {
  const [rows, setRows] = useState<PgActivity[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<PgActivity | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [filterState, setFilterState] = useState<string>("all");

  const fetchActivity = useCallback(async () => {
    try {
      const data = await invoke<PgActivity[]>("get_pg_activity", {
        connectionId: tab.connectionId,
      });
      setRows(data);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [tab.connectionId]);

  useEffect(() => {
    setLoading(true);
    fetchActivity().finally(() => setLoading(false));
  }, [fetchActivity]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchActivity, REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, fetchActivity]);

  const handleCancel = async (pid: number) => {
    if (!confirm(`Cancel query on PID ${pid}?`)) return;
    setActing(pid);
    try {
      await invoke("cancel_backend", { connectionId: tab.connectionId, pid });
      fetchActivity();
    } catch (e) {
      alert(String(e));
    } finally {
      setActing(null);
    }
  };

  const handleTerminate = async (pid: number) => {
    if (!confirm(`Terminate session on PID ${pid}? This will disconnect the client.`)) return;
    setActing(pid);
    try {
      await invoke("terminate_backend", { connectionId: tab.connectionId, pid });
      fetchActivity();
    } catch (e) {
      alert(String(e));
    } finally {
      setActing(null);
    }
  };

  const filtered = filterState === "all"
    ? rows
    : rows.filter((r) => r.state === filterState);

  const states = Array.from(new Set(rows.map((r) => r.state ?? "unknown")));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <span className="text-sm font-medium">Activity Monitor</span>
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="text-xs bg-background border border-border rounded px-2 py-0.5 ml-2"
        >
          <option value="all">All ({rows.length})</option>
          {states.map((s) => (
            <option key={s} value={s}>{s} ({rows.filter((r) => (r.state ?? "unknown") === s).length})</option>
          ))}
        </select>
        <button
          onClick={fetchActivity}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded" />
          Auto ({REFRESH_MS / 1000}s)
        </label>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20 shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
            <tr>
              {["PID", "User", "App", "Client", "State", "Wait", "Duration", "Query", "Actions"].map((h) => (
                <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border whitespace-nowrap text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.pid}
                onClick={() => setSelected(row)}
                className={cn(
                  "hover:bg-accent/40 cursor-pointer transition-colors border-b border-border/30",
                  selected?.pid === row.pid && "bg-accent/20"
                )}
              >
                <td className="px-3 py-1 font-mono text-muted-foreground">{row.pid}</td>
                <td className="px-3 py-1 font-medium">{row.usename}</td>
                <td className="px-3 py-1 text-muted-foreground truncate max-w-[120px]">{row.application_name}</td>
                <td className="px-3 py-1 text-muted-foreground">{row.client_addr ?? "local"}</td>
                <td className={cn("px-3 py-1 font-medium", STATE_COLOR[row.state ?? ""] ?? "")}>
                  {row.state ?? "-"}
                </td>
                <td className="px-3 py-1 text-muted-foreground">
                  {row.wait_event ? `${row.wait_event_type}/${row.wait_event}` : "-"}
                </td>
                <td className={cn("px-3 py-1 font-mono", row.duration_sec != null && row.duration_sec > 60 ? "text-red-400" : "text-muted-foreground")}>
                  {row.duration_sec != null ? `${row.duration_sec}s` : "-"}
                </td>
                <td className="px-3 py-1 max-w-[280px] truncate text-muted-foreground font-mono text-[10px]">
                  {row.query?.replace(/\s+/g, " ") ?? "-"}
                </td>
                <td className="px-3 py-1">
                  {row.state === "active" && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancel(row.pid); }}
                        disabled={acting === row.pid}
                        title="Cancel query"
                        className="text-yellow-500 hover:text-yellow-400 disabled:opacity-40"
                      >
                        {acting === row.pid ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTerminate(row.pid); }}
                        disabled={acting === row.pid}
                        title="Terminate session"
                        className="text-red-500 hover:text-red-400 disabled:opacity-40"
                      >
                        <AlertTriangle size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div className="p-6 text-center text-xs text-muted-foreground">No sessions found.</div>
        )}
      </div>

      {/* Query preview */}
      {selected?.query && (
        <div className="border-t border-border p-3 bg-muted/20 shrink-0">
          <p className="text-[10px] text-muted-foreground mb-1">PID {selected.pid} — full query</p>
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap max-h-24 overflow-auto">{selected.query}</pre>
        </div>
      )}
    </div>
  );
}
