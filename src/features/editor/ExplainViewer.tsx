import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  connectionId: string;
  sql: string;
  onClose: () => void;
}

function PlanNode({ node, depth = 0 }: { node: Record<string, unknown>; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const nodeType = node["Node Type"] as string ?? "Unknown";
  const cost = node["Total Cost"] as number | undefined;
  const actualTime = node["Actual Total Time"] as number | undefined;
  const rows = node["Actual Rows"] as number | undefined;
  const plans = node["Plans"] as Record<string, unknown>[] | undefined;
  const relation = node["Relation Name"] as string | undefined;
  const indexName = node["Index Name"] as string | undefined;

  const timeColor =
    actualTime == null ? "" :
    actualTime < 1 ? "text-green-500" :
    actualTime < 100 ? "text-yellow-500" :
    "text-red-500";

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-accent text-xs group",
          depth === 0 && "font-medium"
        )}
        onClick={() => plans?.length && setOpen((o) => !o)}
      >
        {plans?.length ? (
          open ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        <span className="text-primary font-mono">{nodeType}</span>
        {relation && <span className="text-muted-foreground">on <span className="text-foreground">{relation}</span></span>}
        {indexName && <span className="text-muted-foreground">via <span className="text-blue-400">{indexName}</span></span>}
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {actualTime != null && (
            <span className={cn("font-mono", timeColor)}>{actualTime.toFixed(2)}ms</span>
          )}
          {rows != null && (
            <span className="text-muted-foreground">{rows.toLocaleString()} rows</span>
          )}
          {cost != null && (
            <span className="text-muted-foreground/60">cost={cost.toFixed(2)}</span>
          )}
        </span>
      </div>
      {open && plans?.map((child, i) => (
        <PlanNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ExplainViewer({ connectionId, sql, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  const runExplain = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await invoke<unknown>("explain_query", { connectionId, sql });
      if (Array.isArray(result)) {
        setPlan(result as Record<string, unknown>[]);
      } else if (result && typeof result === "object") {
        setPlan([result as Record<string, unknown>]);
      } else {
        setError("Unexpected EXPLAIN response format");
      }
      setRan(true);
    } catch (e) {
      setError(String(e));
      setRan(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-background/95 z-20 flex flex-col border border-border rounded overflow-hidden backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-yellow-500" />
          <span className="text-sm font-medium">EXPLAIN ANALYZE</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
          Close
        </button>
      </div>

      {!ran ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-xs text-muted-foreground max-w-xs text-center">
            Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) against the current query. This will actually execute the query.
          </p>
          <button
            onClick={runExplain}
            disabled={loading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run EXPLAIN ANALYZE"}
          </button>
        </div>
      ) : error ? (
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p className="text-xs font-mono whitespace-pre-wrap">{error}</p>
          </div>
        </div>
      ) : plan ? (
        <div className="flex-1 overflow-auto p-2">
          {plan.map((root, i) => {
            const planObj = root["Plan"] as Record<string, unknown> | undefined;
            const execTime = root["Execution Time"] as number | undefined;
            const planTime = root["Planning Time"] as number | undefined;
            return (
              <div key={i}>
                {(execTime != null || planTime != null) && (
                  <div className="flex gap-4 px-2 py-1.5 mb-2 bg-muted/50 rounded text-[10px] text-muted-foreground">
                    {planTime != null && <span>Planning: <span className="text-foreground font-mono">{planTime.toFixed(2)}ms</span></span>}
                    {execTime != null && <span>Execution: <span className="text-foreground font-mono">{execTime.toFixed(2)}ms</span></span>}
                  </div>
                )}
                {planObj && <PlanNode node={planObj} />}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
