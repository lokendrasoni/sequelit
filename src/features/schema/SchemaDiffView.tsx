import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConnectionStore } from "@/stores/connectionStore";
import { GitCompare, Plus, Minus, Edit, Loader2, Copy } from "lucide-react";
import { Tab } from "@/stores/tabStore";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface DiffEntry {
  kind: "added" | "removed" | "modified";
  object_type: string;
  name: string;
  detail?: string;
  sql?: string;
}

const KIND_ICON = {
  added: <Plus size={11} className="text-green-500 shrink-0" />,
  removed: <Minus size={11} className="text-red-500 shrink-0" />,
  modified: <Edit size={11} className="text-yellow-500 shrink-0" />,
};

const KIND_BG = {
  added: "bg-green-500/5 border-green-500/20",
  removed: "bg-red-500/5 border-red-500/20",
  modified: "bg-yellow-500/5 border-yellow-500/20",
};

interface Props {
  tab: Tab;
}

export function SchemaDiffView({ tab }: Props) {
  const connections = useConnectionStore((s) => s.connections);
  const connectedIds = useConnectionStore((s) => s.connectedIds);
  const connectedConns = connections.filter((c) => connectedIds.includes(c.id));

  const [conn1Id, setConn1Id] = useState(tab.connectionId ?? "");
  const [schema1, setSchema1] = useState(tab.schema ?? "public");
  const [conn2Id, setConn2Id] = useState("");
  const [schema2, setSchema2] = useState("public");
  const [diffs, setDiffs] = useState<DiffEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "added" | "removed" | "modified">("all");

  const runDiff = async () => {
    if (!conn1Id || !conn2Id) { setError("Select both connections"); return; }
    setLoading(true);
    setError("");
    setDiffs(null);
    try {
      const result = await invoke<DiffEntry[]>("diff_schemas", {
        conn1Id,
        schema1,
        conn2Id,
        schema2,
      });
      setDiffs(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const filtered = diffs
    ? filter === "all" ? diffs : diffs.filter((d) => d.kind === filter)
    : null;

  const sqlScript = filtered?.filter((d) => d.sql).map((d) => d.sql).join("\n") ?? "";

  const copySql = () => navigator.clipboard.writeText(sqlScript);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Config bar */}
      <div className="flex items-end gap-3 px-4 py-3 border-b border-border bg-muted/20 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <GitCompare size={15} className="text-primary" />
          <span className="text-sm font-medium">Schema Diff</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Source connection</Label>
            <select
              value={conn1Id}
              onChange={(e) => setConn1Id(e.target.value)}
              className="text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select…</option>
              {connectedConns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Schema</Label>
            <input
              value={schema1}
              onChange={(e) => setSchema1(e.target.value)}
              className="text-xs bg-background border border-border rounded px-2 py-1 outline-none w-24 focus:ring-1 focus:ring-primary"
              placeholder="public"
            />
          </div>
        </div>

        <span className="text-muted-foreground text-sm">→</span>

        <div className="flex items-center gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Target connection</Label>
            <select
              value={conn2Id}
              onChange={(e) => setConn2Id(e.target.value)}
              className="text-xs bg-background border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select…</option>
              {connectedConns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Schema</Label>
            <input
              value={schema2}
              onChange={(e) => setSchema2(e.target.value)}
              className="text-xs bg-background border border-border rounded px-2 py-1 outline-none w-24 focus:ring-1 focus:ring-primary"
              placeholder="public"
            />
          </div>
        </div>

        <button
          onClick={runDiff}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <GitCompare size={12} />}
          Run Diff
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20">
          {error}
        </div>
      )}

      {diffs !== null && (
        <>
          {/* Filter tabs + SQL copy */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10 shrink-0">
            <div className="flex gap-1">
              {(["all", "added", "removed", "modified"] as const).map((f) => {
                const count = f === "all" ? diffs.length : diffs.filter((d) => d.kind === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded capitalize",
                      filter === f ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {f} ({count})
                  </button>
                );
              })}
            </div>
            {sqlScript && (
              <button
                onClick={copySql}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Copy size={11} />
                Copy Migration SQL
              </button>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {(filtered ?? []).length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {diffs.length === 0 ? "Schemas are identical — no differences found." : "No items match the selected filter."}
              </div>
            )}
            {(filtered ?? []).map((d, i) => (
              <div key={i} className={cn("px-4 py-2.5 border-b border-border/50", KIND_BG[d.kind])}>
                <div className="flex items-start gap-2">
                  {KIND_ICON[d.kind]}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">{d.object_type}</span>
                      <span className="text-xs font-mono font-medium">{d.name}</span>
                    </div>
                    {d.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{d.detail}</p>}
                    {d.sql && (
                      <pre className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1 mt-1 whitespace-pre-wrap">
                        {d.sql}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {diffs === null && !loading && !error && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Select two connections and click Run Diff to compare schemas.
        </div>
      )}
    </div>
  );
}
