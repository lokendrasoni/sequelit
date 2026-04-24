import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { RefreshCw, Key, Hash, Link, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColumnDetail {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  ordinal_position: number;
  is_primary_key: boolean;
  is_unique: boolean;
}

interface TableDetail {
  schema: string;
  name: string;
  columns: ColumnDetail[];
}

interface IndexInfo {
  name: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string;
  definition: string;
}

interface ConstraintInfo {
  name: string;
  constraint_type: string;
  columns: string;
  definition: string;
}

type SubTab = "columns" | "indexes" | "constraints";

interface Props { tab: Tab }

export function TablePropertiesTab({ tab }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("columns");
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [constraints, setConstraints] = useState<ConstraintInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tab.schema || !tab.table) return;
    setLoading(true);
    setError(null);
    try {
      const [d, idx, con] = await Promise.all([
        invoke<TableDetail>("get_table_detail", {
          connectionId: tab.connectionId,
          schema: tab.schema,
          table: tab.table,
        }),
        invoke<IndexInfo[]>("get_table_indexes", {
          connectionId: tab.connectionId,
          schema: tab.schema,
          table: tab.table,
        }),
        invoke<ConstraintInfo[]>("get_table_constraints", {
          connectionId: tab.connectionId,
          schema: tab.schema,
          table: tab.table,
        }),
      ]);
      setDetail(d);
      setIndexes(idx);
      setConstraints(con);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab.connectionId, tab.schema, tab.table]);

  const constraintTypeColor = (t: string) => {
    switch (t) {
      case "PRIMARY KEY": return "text-yellow-500";
      case "UNIQUE": return "text-blue-400";
      case "FOREIGN KEY": return "text-purple-400";
      case "CHECK": return "text-green-400";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-muted/20">
        <div>
          <span className="text-xs text-muted-foreground">{tab.schema}.</span>
          <span className="text-sm font-semibold">{tab.table}</span>
        </div>
        <button onClick={load} disabled={loading} className="text-muted-foreground hover:text-foreground" title="Refresh">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b border-border shrink-0">
        {(["columns", "indexes", "constraints"] as SubTab[]).map((t) => (
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
            {t === "columns" && detail && (
              <span className="ml-1 text-[10px] text-muted-foreground">({detail.columns.length})</span>
            )}
            {t === "indexes" && (
              <span className="ml-1 text-[10px] text-muted-foreground">({indexes.length})</span>
            )}
            {t === "constraints" && (
              <span className="ml-1 text-[10px] text-muted-foreground">({constraints.length})</span>
            )}
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

        {!error && subTab === "columns" && detail && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border text-muted-foreground w-6">#</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Column</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Type</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Nullable</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Default</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Constraints</th>
              </tr>
            </thead>
            <tbody>
              {detail.columns.map((col, i) => (
                <tr key={col.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 text-muted-foreground/50 font-mono">{col.ordinal_position}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono font-medium flex items-center gap-1">
                    {col.is_primary_key && <Key size={10} className="text-yellow-500 shrink-0" />}
                    {col.name}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-blue-400">{col.data_type}</td>
                  <td className="px-3 py-1.5 border-b border-border/40">
                    {col.is_nullable
                      ? <span className="text-muted-foreground">YES</span>
                      : <span className="text-orange-400 font-medium">NOT NULL</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground max-w-[200px] truncate">
                    {col.column_default ?? <span className="italic text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 flex items-center gap-1">
                    {col.is_primary_key && <span className="text-[10px] px-1 rounded bg-yellow-500/15 text-yellow-500">PK</span>}
                    {col.is_unique && !col.is_primary_key && <span className="text-[10px] px-1 rounded bg-blue-500/15 text-blue-400">UQ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && subTab === "indexes" && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Name</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Columns</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Type</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Definition</th>
              </tr>
            </thead>
            <tbody>
              {indexes.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground text-center">No indexes</td></tr>
              ) : indexes.map((idx, i) => (
                <tr key={idx.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono">
                    <div className="flex items-center gap-1">
                      {idx.is_primary && <Key size={10} className="text-yellow-500" />}
                      {idx.is_unique && !idx.is_primary && <Hash size={10} className="text-blue-400" />}
                      {idx.name}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{idx.columns}</td>
                  <td className="px-3 py-1.5 border-b border-border/40">
                    {idx.is_primary
                      ? <span className="text-[10px] px-1 rounded bg-yellow-500/15 text-yellow-500">PRIMARY</span>
                      : idx.is_unique
                        ? <span className="text-[10px] px-1 rounded bg-blue-500/15 text-blue-400">UNIQUE</span>
                        : <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">INDEX</span>}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-[11px] text-muted-foreground max-w-[340px] truncate" title={idx.definition}>
                    {idx.definition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && subTab === "constraints" && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Name</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Type</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Columns</th>
                <th className="text-left px-3 py-2 font-medium border-b border-border">Definition</th>
              </tr>
            </thead>
            <tbody>
              {constraints.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground text-center">No constraints</td></tr>
              ) : constraints.map((con, i) => (
                <tr key={con.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/10"}>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono">
                    <div className="flex items-center gap-1">
                      {con.constraint_type === "FOREIGN KEY" && <Link size={10} className="text-purple-400" />}
                      {con.name}
                    </div>
                  </td>
                  <td className={cn("px-3 py-1.5 border-b border-border/40 font-medium text-[11px]", constraintTypeColor(con.constraint_type))}>
                    {con.constraint_type}
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-muted-foreground">{con.columns}</td>
                  <td className="px-3 py-1.5 border-b border-border/40 font-mono text-[11px] text-muted-foreground max-w-[340px] truncate" title={con.definition}>
                    {con.definition}
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
