import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { Shield, Table2, Radio, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RlsPolicy {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

interface PartitionInfo {
  parent_schema: string;
  parent_table: string;
  partition_schema: string;
  partition_table: string;
  partition_expression: string;
}

interface Publication {
  pubname: string;
  puballtables: boolean;
  pubinsert: boolean;
  pubupdate: boolean;
  pubdelete: boolean;
  pubtruncate: boolean;
}

interface Subscription {
  subname: string;
  subenabled: boolean;
  subpublications: string[];
  subconninfo: string;
}

type ViewType = "rls" | "partitions" | "replication";

interface Props {
  tab: Tab;
}

export function PgManagement({ tab }: Props) {
  const [view, setView] = useState<ViewType>("rls");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [policies, setPolicies] = useState<RlsPolicy[]>([]);
  const [partitions, setPartitions] = useState<PartitionInfo[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const load = useCallback(async (v: ViewType) => {
    setLoading(true);
    setError("");
    try {
      if (v === "rls") {
        const p = await invoke<RlsPolicy[]>("get_rls_policies", { connectionId: tab.connectionId });
        setPolicies(p);
      } else if (v === "partitions") {
        const p = await invoke<PartitionInfo[]>("get_partitions", { connectionId: tab.connectionId });
        setPartitions(p);
      } else {
        const [pubs, subs] = await Promise.all([
          invoke<Publication[]>("get_publications", { connectionId: tab.connectionId }),
          invoke<Subscription[]>("get_subscriptions", { connectionId: tab.connectionId }),
        ]);
        setPublications(pubs);
        setSubscriptions(subs);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId]);

  useEffect(() => { load(view); }, [load, view]);

  const switchView = (v: ViewType) => {
    setView(v);
    load(v);
  };

  const dropPolicy = async (schema: string, table: string, policy: string) => {
    if (!confirm(`Drop policy "${policy}" on "${schema}"."${table}"?`)) return;
    try {
      await invoke("drop_rls_policy", { connectionId: tab.connectionId, schema, table, policyName: policy });
      load(view);
    } catch (e) {
      alert(String(e));
    }
  };

  const toggleRls = async (schema: string, table: string, enable: boolean) => {
    const cmd = enable ? "enable_rls" : "disable_rls";
    try {
      await invoke(cmd, { connectionId: tab.connectionId, schema, table });
      load(view);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <Shield size={14} className="text-primary" />
        <span className="text-sm font-medium">PG Management</span>
        <div className="flex gap-1 ml-4">
          {([
            ["rls", Shield, "Row Level Security"],
            ["partitions", Table2, "Partitions"],
            ["replication", Radio, "Replication"],
          ] as [ViewType, React.ElementType, string][]).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={cn(
                "flex items-center gap-1 text-xs px-2 py-0.5 rounded",
                view === v
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(view)}
          disabled={loading}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20 shrink-0">
          {error}
        </div>
      )}

      {/* RLS Policies */}
      {view === "rls" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                {["Schema", "Table", "Policy", "Type", "Command", "Roles", "Using", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {policies.map((p, i) => (
                <tr key={i} className="hover:bg-accent/40 border-b border-border/30 group">
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.schemaname}</td>
                  <td className="px-3 py-1.5 font-mono font-medium">{p.tablename}</td>
                  <td className="px-3 py-1.5 font-mono">{p.policyname}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      p.permissive === "PERMISSIVE"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    )}>
                      {p.permissive}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">{p.cmd}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.roles.join(", ") || "PUBLIC"}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[200px] truncate" title={p.qual ?? ""}>
                    {p.qual ?? ""}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleRls(p.schemaname, p.tablename, false)}
                        className="text-[10px] text-muted-foreground hover:text-orange-500 px-1"
                        title="Disable RLS on table"
                      >
                        Disable RLS
                      </button>
                      <button
                        onClick={() => dropPolicy(p.schemaname, p.tablename, p.policyname)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Drop policy"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && policies.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No RLS policies found.
                    <span className="block text-[10px] mt-1 opacity-70">
                      Enable RLS on a table with: <code className="font-mono">ALTER TABLE t ENABLE ROW LEVEL SECURITY;</code>
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Partitions */}
      {view === "partitions" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                {["Parent Schema", "Parent Table", "Partition Schema", "Partition", "Expression"].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partitions.map((p, i) => (
                <tr key={i} className="hover:bg-accent/40 border-b border-border/30">
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.parent_schema}</td>
                  <td className="px-3 py-1.5 font-mono font-medium">{p.parent_table}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{p.partition_schema}</td>
                  <td className="px-3 py-1.5 font-mono">{p.partition_table}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.partition_expression}</td>
                </tr>
              ))}
              {!loading && partitions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No partitioned tables found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Replication */}
      {view === "replication" && (
        <div className="flex-1 overflow-auto p-3 space-y-4">
          {/* Publications */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Publications ({publications.length})
            </h3>
            {publications.length === 0 ? (
              <p className="text-xs text-muted-foreground">No publications found.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {["Name", "All Tables", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].map((h) => (
                      <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {publications.map((p) => (
                    <tr key={p.pubname} className="hover:bg-accent/40 border-b border-border/30">
                      <td className="px-3 py-1.5 font-mono font-medium">{p.pubname}</td>
                      <td className="px-3 py-1.5">{p.puballtables ? "Yes" : "No"}</td>
                      <td className="px-3 py-1.5">{p.pubinsert ? "✓" : "–"}</td>
                      <td className="px-3 py-1.5">{p.pubupdate ? "✓" : "–"}</td>
                      <td className="px-3 py-1.5">{p.pubdelete ? "✓" : "–"}</td>
                      <td className="px-3 py-1.5">{p.pubtruncate ? "✓" : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Subscriptions */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Subscriptions ({subscriptions.length})
            </h3>
            {subscriptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No subscriptions found.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {["Name", "Enabled", "Publications", "Connection"].map((h) => (
                      <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.subname} className="hover:bg-accent/40 border-b border-border/30">
                      <td className="px-3 py-1.5 font-mono font-medium">{s.subname}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px]",
                          s.subenabled
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {s.subenabled ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{s.subpublications.join(", ")}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px] max-w-[200px] truncate" title={s.subconninfo}>
                        {s.subconninfo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
