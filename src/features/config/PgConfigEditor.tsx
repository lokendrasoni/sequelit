import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { Settings, RefreshCw, RotateCcw, Save, AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PgSetting {
  name: string;
  setting: string;
  unit: string | null;
  category: string;
  short_desc: string;
  context: string;
  vartype: string;
  source: string;
  min_val: string | null;
  max_val: string | null;
  enumvals: string[] | null;
  boot_val: string;
  reset_val: string;
  pending_restart: boolean;
}

type ViewMode = "settings" | "hba";

interface HbaRule {
  line_number: number;
  rule_type: string;
  database: string[];
  user_name: string[];
  address: string | null;
  netmask: string | null;
  auth_method: string;
  options: string[] | null;
  error: string | null;
}

interface Props {
  tab: Tab;
}

export function PgConfigEditor({ tab }: Props) {
  const [settings, setSettings] = useState<PgSetting[]>([]);
  const [hbaRules, setHbaRules] = useState<HbaRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewMode>("settings");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke<PgSetting[]>("get_pg_settings", { connectionId: tab.connectionId });
      setSettings(data);
      setPendingCount(data.filter((s) => s.pending_restart).length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId]);

  const fetchHba = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke<HbaRule[]>("get_hba_rules", { connectionId: tab.connectionId });
      setHbaRules(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId]);

  useEffect(() => {
    if (view === "settings") fetchSettings();
    else fetchHba();
  }, [view, fetchSettings, fetchHba]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(settings.map((s) => s.category))).sort();
    return ["all", ...cats];
  }, [settings]);

  const filtered = useMemo(() => {
    return settings.filter((s) => {
      const matchSearch = !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.short_desc.toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "all" || s.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [settings, search, categoryFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, PgSetting[]> = {};
    for (const s of filtered) {
      g[s.category] = g[s.category] ?? [];
      g[s.category].push(s);
    }
    return g;
  }, [filtered]);

  const startEdit = (s: PgSetting) => {
    setEditRow(s.name);
    setEditValue(s.setting);
  };

  const handleSave = async (name: string) => {
    setSaving(true);
    try {
      await invoke("set_pg_setting", { connectionId: tab.connectionId, name, value: editValue });
      setEditRow(null);
      fetchSettings();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (name: string) => {
    if (!confirm(`Reset "${name}" to default?`)) return;
    try {
      await invoke("reset_pg_setting", { connectionId: tab.connectionId, name });
      fetchSettings();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await invoke("reload_pg_config", { connectionId: tab.connectionId });
      fetchSettings();
    } catch (e) {
      alert(String(e));
    } finally {
      setReloading(false);
    }
  };

  const CONTEXT_COLOR: Record<string, string> = {
    user: "text-green-500",
    superuser: "text-yellow-500",
    sighup: "text-blue-400",
    "postmaster": "text-red-400",
    backend: "text-muted-foreground",
    internal: "text-muted-foreground/50",
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <Settings size={14} className="text-primary" />
        <span className="text-sm font-medium">PostgreSQL Configuration</span>
        <div className="flex gap-1 ml-2">
          {(["settings", "hba"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "text-xs px-2 py-0.5 rounded",
                view === v ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {v === "settings" ? "postgresql.conf" : "pg_hba.conf"}
            </button>
          ))}
        </div>
        {pendingCount > 0 && view === "settings" && (
          <span className="flex items-center gap-1 text-xs text-yellow-500 px-2 py-0.5 rounded bg-yellow-500/10">
            <AlertTriangle size={11} /> {pendingCount} pending restart
          </span>
        )}
        <button
          onClick={handleReload}
          disabled={reloading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          {reloading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Reload Config
        </button>
        <button
          onClick={() => view === "settings" ? fetchSettings() : fetchHba()}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20 shrink-0">
          {error}
        </div>
      )}

      {view === "settings" && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
            <Search size={12} className="text-muted-foreground shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="h-6 text-xs py-0 flex-1 max-w-xs"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-background border border-border rounded px-2 py-0.5 ml-2 max-w-[200px]"
            >
              {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-auto">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="sticky top-0 bg-muted/60 backdrop-blur px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border z-10">
                  {category} ({items.length})
                </div>
                {items.map((s) => (
                  <div
                    key={s.name}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2 border-b border-border/30 hover:bg-accent/20 group",
                      s.pending_restart && "bg-yellow-500/5"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium">{s.name}</span>
                        {s.pending_restart && <AlertTriangle size={10} className="text-yellow-500" />}
                        <span className={cn("text-[9px] font-medium", CONTEXT_COLOR[s.context] ?? "text-muted-foreground")}>
                          {s.context}
                        </span>
                        {s.source !== "default" && (
                          <span className="text-[9px] text-blue-400">{s.source}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{s.short_desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editRow === s.name ? (
                        <>
                          {s.enumvals ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="text-xs bg-background border border-primary rounded px-2 py-0.5"
                            >
                              {s.enumvals.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          ) : (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-6 text-xs w-32"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") handleSave(s.name); if (e.key === "Escape") setEditRow(null); }}
                            />
                          )}
                          <button
                            onClick={() => handleSave(s.name)}
                            disabled={saving}
                            className="text-green-500 hover:text-green-400"
                          >
                            <Save size={13} />
                          </button>
                          <button onClick={() => setEditRow(null)} className="text-muted-foreground hover:text-foreground">
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className="text-xs font-mono text-foreground cursor-pointer hover:text-primary"
                            onClick={() => startEdit(s)}
                          >
                            {s.setting}{s.unit ? ` ${s.unit}` : ""}
                          </span>
                          <button
                            onClick={() => handleReset(s.name)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                            title="Reset to default"
                          >
                            <RotateCcw size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {view === "hba" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                {["Line", "Type", "Database", "User", "Address", "Method", "Options", "Error"].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hbaRules.map((r) => (
                <tr key={r.line_number} className={cn("border-b border-border/30 hover:bg-accent/20", r.error && "bg-red-500/5")}>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{r.line_number}</td>
                  <td className="px-3 py-1.5 font-mono">{r.rule_type}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.database.join(", ")}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.user_name.join(", ")}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.address ?? "-"}{r.netmask ? `/${r.netmask}` : ""}</td>
                  <td className="px-3 py-1.5 font-medium">{r.auth_method}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.options?.join(" ") ?? "-"}</td>
                  <td className="px-3 py-1.5 text-red-400 text-[10px]">{r.error ?? ""}</td>
                </tr>
              ))}
              {hbaRules.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">No rules loaded. Requires pg_hba_file_rules view (PostgreSQL 10+).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
