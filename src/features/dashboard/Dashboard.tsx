import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from "recharts";
import { Tab } from "@/stores/tabStore";
import { RefreshCw, Activity, Database, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStats {
  active_count: number;
  idle_count: number;
  idle_tx_count: number;
  waiting_count: number;
  total_backends: number;
  xact_commit: number;
  xact_rollback: number;
  blks_read: number;
  blks_hit: number;
  tup_inserted: number;
  tup_updated: number;
  tup_deleted: number;
  tup_fetched: number;
  cache_hit_ratio: number;
  locks_waiting: number;
}

interface HistoryPoint {
  time: string;
  active: number;
  idle: number;
  idle_tx: number;
  commits: number;
  rollbacks: number;
}

const REFRESH_MS = 5000;
const MAX_HISTORY = 30;

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: string;
}

function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border p-3 bg-card", accent)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

interface Props {
  tab: Tab;
}

export function Dashboard({ tab }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const prevCommits = useRef<number | null>(null);
  const prevRollbacks = useRef<number | null>(null);

  const fetchStats = async () => {
    try {
      const s = await invoke<DashboardStats>("get_dashboard_stats", {
        connectionId: tab.connectionId,
      });
      setStats(s);
      setError("");

      const time = new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const commits = prevCommits.current !== null ? s.xact_commit - prevCommits.current : 0;
      const rollbacks = prevRollbacks.current !== null ? s.xact_rollback - prevRollbacks.current : 0;
      prevCommits.current = s.xact_commit;
      prevRollbacks.current = s.xact_rollback;

      setHistory((prev) => {
        const next = [...prev, {
          time,
          active: s.active_count,
          idle: s.idle_count,
          idle_tx: s.idle_tx_count,
          commits: Math.max(0, commits),
          rollbacks: Math.max(0, rollbacks),
        }];
        return next.slice(-MAX_HISTORY);
      });
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.connectionId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchStats, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, tab.connectionId]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive text-xs p-4 text-center">
        {error}
        <br />
        <span className="text-muted-foreground mt-1">Dashboard requires PostgreSQL with monitoring privileges.</span>
      </div>
    );
  }

  const sessionPieData = stats ? [
    { name: "Active", value: stats.active_count, fill: "#22c55e" },
    { name: "Idle", value: stats.idle_count, fill: "#64748b" },
    { name: "Idle in TX", value: stats.idle_tx_count, fill: "#f59e0b" },
  ].filter((d) => d.value > 0) : [];

  const ioData = stats ? [
    { name: "Blk Read", value: stats.blks_read },
    { name: "Blk Hit", value: stats.blks_hit },
    { name: "Fetched", value: stats.tup_fetched },
    { name: "Inserted", value: stats.tup_inserted },
    { name: "Updated", value: stats.tup_updated },
    { name: "Deleted", value: stats.tup_deleted },
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          <span className="text-sm font-medium">Dashboard</span>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          Auto ({REFRESH_MS / 1000}s)
        </label>
      </div>

      {stats && (
        <div className="p-4 space-y-4 flex-1">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active Connections" value={stats.active_count} icon={<Activity size={13} className="text-green-500" />} />
            <StatCard label="Idle Connections" value={stats.idle_count} icon={<Database size={13} className="text-muted-foreground" />} />
            <StatCard label="Idle in TX" value={stats.idle_tx_count} icon={<Zap size={13} className="text-yellow-500" />} />
            <StatCard
              label="Cache Hit Ratio"
              value={`${stats.cache_hit_ratio.toFixed(1)}%`}
              accent={stats.cache_hit_ratio < 90 ? "border-yellow-500/30" : "border-green-500/30"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Session history */}
            <div className="rounded-lg border border-border p-3 bg-card">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Sessions Over Time</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="active" stroke="#22c55e" strokeWidth={2} dot={false} name="Active" />
                  <Line type="monotone" dataKey="idle" stroke="#64748b" strokeWidth={1.5} dot={false} name="Idle" />
                  <Line type="monotone" dataKey="idle_tx" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Idle TX" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* TPS history */}
            <div className="rounded-lg border border-border p-3 bg-card">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Transactions/interval</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="commits" fill="#6366f1" name="Commits" />
                  <Bar dataKey="rollbacks" fill="#ef4444" name="Rollbacks" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Session pie */}
            <div className="rounded-lg border border-border p-3 bg-card">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Session Distribution</p>
              {sessionPieData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={sessionPieData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                        {sessionPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {sessionPieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-mono font-medium ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No active sessions</p>
              )}
            </div>

            {/* I/O stats */}
            <div className="rounded-lg border border-border p-3 bg-card">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Cumulative I/O & Tuple Stats</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={ioData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={55} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="value" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Locks indicator */}
          {stats.locks_waiting > 0 && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-500">
              ⚠ {stats.locks_waiting} lock conflict{stats.locks_waiting !== 1 ? "s" : ""} waiting
            </div>
          )}
        </div>
      )}
    </div>
  );
}
