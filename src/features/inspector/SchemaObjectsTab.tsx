import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchemaType {
  name: string;
  category: string;
  details: string | null;
}

interface SchemaFunction {
  name: string;
  kind: string;
  arguments: string;
  return_type: string;
  language: string;
}

interface SchemaSequence {
  name: string;
  start_value: number;
  increment: number;
  min_value: number;
  max_value: number;
  is_cycle: boolean;
}

type SubTab = "types" | "functions" | "sequences";

interface Props { tab: Tab }

export function SchemaObjectsTab({ tab }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("types");
  const [types, setTypes] = useState<SchemaType[]>([]);
  const [functions, setFunctions] = useState<SchemaFunction[]>([]);
  const [sequences, setSequences] = useState<SchemaSequence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tab.schema) return;
    setLoading(true);
    setError(null);
    try {
      const [t, f, s] = await Promise.all([
        invoke<SchemaType[]>("get_schema_types", {
          connectionId: tab.connectionId,
          schema: tab.schema,
        }),
        invoke<SchemaFunction[]>("get_schema_functions", {
          connectionId: tab.connectionId,
          schema: tab.schema,
        }),
        invoke<SchemaSequence[]>("get_schema_sequences", {
          connectionId: tab.connectionId,
          schema: tab.schema,
        }),
      ]);
      setTypes(t);
      setFunctions(f);
      setSequences(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab.connectionId, tab.schema]);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "enum": return "text-green-400 bg-green-400/10";
      case "domain": return "text-blue-400 bg-blue-400/10";
      case "composite": return "text-purple-400 bg-purple-400/10";
      case "range": return "text-orange-400 bg-orange-400/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const kindColor = (kind: string) => {
    switch (kind) {
      case "function": return "text-blue-400 bg-blue-400/10";
      case "procedure": return "text-purple-400 bg-purple-400/10";
      case "aggregate": return "text-orange-400 bg-orange-400/10";
      case "window": return "text-green-400 bg-green-400/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-muted/20">
        <span className="text-sm font-semibold">{tab.schema}</span>
        <button onClick={load} disabled={loading} className="text-muted-foreground hover:text-foreground" title="Refresh">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b border-border shrink-0">
        {(["types", "functions", "sequences"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={cn(
              "px-3 py-1 text-xs rounded-t capitalize transition-colors",
              subTab === t
                ? "bg-background border border-b-background border-border text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({t === "types" ? types.length : t === "functions" ? functions.length : sequences.length})
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {!error && subTab === "types" && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Name</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Category</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Details</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-4 text-muted-foreground text-center">No types defined in this schema</td></tr>
              ) : types.map((t, i) => (
                <tr key={t.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono font-medium">{t.name}</td>
                  <td className="px-3 py-1.5 border-b border-border/40">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", categoryColor(t.category))}>
                      {t.category}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground max-w-[400px] truncate" title={t.details ?? ""}>
                    {t.details ?? <span className="italic opacity-50">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && subTab === "functions" && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Name</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Kind</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Arguments</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Returns</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Language</th>
              </tr>
            </thead>
            <tbody>
              {functions.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground text-center">No functions defined in this schema</td></tr>
              ) : functions.map((f, i) => (
                <tr key={`${f.name}-${f.arguments}`} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono font-medium">{f.name}</td>
                  <td className="px-3 py-1.5 border-b border-border/40">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", kindColor(f.kind))}>
                      {f.kind}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground max-w-[200px] truncate" title={f.arguments}>
                    {f.arguments || <span className="italic opacity-50">none</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-blue-400 max-w-[140px] truncate">
                    {f.return_type || "—"}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 text-muted-foreground">{f.language}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && subTab === "sequences" && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Name</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Start</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Increment</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Min</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Max</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Cycle</th>
              </tr>
            </thead>
            <tbody>
              {sequences.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground text-center">No sequences in this schema</td></tr>
              ) : sequences.map((s, i) => (
                <tr key={s.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono font-medium">{s.name}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{s.start_value}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{s.increment}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{s.min_value}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{s.max_value}</td>
                  <td className="px-3 py-1.5 border-b border-border/40">
                    {s.is_cycle
                      ? <span className="text-green-400">YES</span>
                      : <span className="text-muted-foreground">NO</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
