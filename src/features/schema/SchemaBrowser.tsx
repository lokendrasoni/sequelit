import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConnectionStore } from "@/stores/connectionStore";
import { useTabStore } from "@/stores/tabStore";
import {
  ChevronRight, ChevronDown, Table2, Eye, RefreshCw, Database,
  Network, GitCompare, ChevronsUpDown, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TableInfo {
  schema: string;
  name: string;
  table_type: string;
}

interface SchemaNode {
  name: string;
  tables: TableInfo[];
  expanded: boolean;
  loading: boolean;
}

export function SchemaBrowser() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connectedIds = useConnectionStore((s) => s.connectedIds);
  const connections = useConnectionStore((s) => s.connections);
  const { openTab } = useTabStore();

  const [schemas, setSchemas] = useState<SchemaNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  // null = using the connected pool directly; string = browsing a specific other DB
  const [browseDb, setBrowseDb] = useState<string | null>(null);
  const [dbPickerOpen, setDbPickerOpen] = useState(false);
  const dbPickerRef = useRef<HTMLDivElement>(null);
  const [showSystem, setShowSystem] = useState(() => {
    return localStorage.getItem("schema-show-system") === "true";
  });

  const isConnected = activeConnectionId ? connectedIds.includes(activeConnectionId) : false;
  const activeConn = connections.find((c) => c.id === activeConnectionId);
  const isSqlite = activeConn?.db_type === "sqlite";
  // Label shown on the DB picker button
  const displayDb = browseDb ?? activeConn?.database ?? "";

  // Reset and reload when connection changes.
  useEffect(() => {
    setBrowseDb(null);
    setSchemas([]);
    setDatabases([]);
    setError(null);

    if (!isConnected || !activeConnectionId) return;

    // Always use the existing pool on initial connect — no browse pool needed.
    doLoadSchemas(activeConnectionId, null);
    doLoadDatabases(activeConnectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnectionId, isConnected]);

  // Close db picker on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dbPickerRef.current && !dbPickerRef.current.contains(e.target as Node)) {
        setDbPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────

  const doLoadDatabases = async (connId: string) => {
    if (isSqlite) return;
    try {
      const dbs = await invoke<string[]>("get_databases", { connectionId: connId });
      setDatabases(dbs);
    } catch {
      setDatabases([]);
    }
  };

  /**
   * database = null  → use the existing connected pool (fast path, always works)
   * database = "foo" → open / reuse a browse pool for that database
   */
  const doLoadSchemas = async (connId: string, database: string | null, sys?: boolean) => {
    const sysFlag = sys ?? showSystem;
    setLoading(true);
    setSchemas([]);
    setError(null);
    try {
      const args: Record<string, unknown> = { connectionId: connId, showSystem: sysFlag };
      if (database !== null) args.database = database;
      const names = await invoke<string[]>("get_schemas", args);
      setSchemas(names.map((n) => ({ name: n, tables: [], expanded: false, loading: false })));
    } catch (e) {
      setError(String(e));
      setSchemas([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSchema = async (schemaName: string) => {
    if (!activeConnectionId) return;
    const node = schemas.find((s) => s.name === schemaName);
    if (!node) return;

    if (node.expanded) {
      setSchemas((prev) =>
        prev.map((s) => (s.name === schemaName ? { ...s, expanded: false } : s))
      );
      return;
    }

    if (node.tables.length > 0) {
      setSchemas((prev) =>
        prev.map((s) => (s.name === schemaName ? { ...s, expanded: true } : s))
      );
      return;
    }

    setSchemas((prev) =>
      prev.map((s) => (s.name === schemaName ? { ...s, loading: true } : s))
    );
    try {
      const args: Record<string, string> = {
        connectionId: activeConnectionId,
        schema: schemaName,
      };
      if (browseDb !== null) args.database = browseDb;
      const tables = await invoke<TableInfo[]>("get_tables", args);
      setSchemas((prev) =>
        prev.map((s) =>
          s.name === schemaName ? { ...s, tables, expanded: true, loading: false } : s
        )
      );
    } catch {
      setSchemas((prev) =>
        prev.map((s) => (s.name === schemaName ? { ...s, loading: false } : s))
      );
    }
  };

  const selectDatabase = (db: string) => {
    if (!activeConnectionId) return;
    setDbPickerOpen(false);
    const defaultDb = activeConn?.database ?? "";
    const target = db === defaultDb ? null : db;
    setBrowseDb(target);
    doLoadSchemas(activeConnectionId, target);
  };

  const openDataBrowser = (schema: string, table: string) => {
    if (!activeConnectionId) return;
    openTab({
      type: "data",
      title: `${schema}.${table}`,
      connectionId: activeConnectionId,
      schema,
      table,
    });
  };

  const openErd = (schema: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeConnectionId) return;
    openTab({ type: "erd", title: `ERD: ${schema}`, connectionId: activeConnectionId, schema });
  };

  const openSchemaDiff = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeConnectionId) return;
    openTab({ type: "schema-diff", title: "Schema Diff", connectionId: activeConnectionId });
  };

  if (!isConnected) return null;

  return (
    <div className="flex flex-col min-h-0 border-t border-sidebar-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Schema
        </span>
        <div className="flex items-center gap-1">
          <button onClick={openSchemaDiff} className="text-muted-foreground hover:text-foreground" title="Schema Diff">
            <GitCompare size={11} />
          </button>
          <button
            onClick={() => {
              const next = !showSystem;
              setShowSystem(next);
              localStorage.setItem("schema-show-system", String(next));
              if (activeConnectionId) doLoadSchemas(activeConnectionId, browseDb, next);
            }}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              showSystem && "text-primary"
            )}
            title={showSystem ? "Hide system schemas" : "Show system schemas"}
          >
            <Filter size={11} />
          </button>
          <button
            onClick={() => activeConnectionId && doLoadSchemas(activeConnectionId, browseDb)}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Database selector */}
      {!isSqlite && (
        <div className="px-2 pb-1.5 shrink-0 relative" ref={dbPickerRef}>
          <button
            onClick={() => setDbPickerOpen((o) => !o)}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors",
              "border-border bg-background hover:bg-accent text-foreground",
              dbPickerOpen && "border-ring"
            )}
          >
            <Database size={11} className="text-primary/70 shrink-0" />
            <span className="flex-1 text-left truncate font-mono text-[11px]">
              {displayDb || "default"}
            </span>
            <ChevronsUpDown size={10} className="text-muted-foreground shrink-0" />
          </button>

          {dbPickerOpen && databases.length > 0 && (
            <div className="absolute z-50 left-2 right-2 mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto py-1">
                {databases.map((db) => (
                  <button
                    key={db}
                    onClick={() => selectDatabase(db)}
                    className={cn(
                      "w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors font-mono",
                      db === displayDb && "text-primary font-semibold bg-accent/50"
                    )}
                  >
                    {db}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schema tree */}
      <div className="overflow-y-auto flex-1">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <RefreshCw size={11} className="animate-spin" />
            Loading…
          </div>
        )}

        {!loading && error && (
          <p className="text-xs text-destructive px-3 py-2 break-all">{error}</p>
        )}

        {!loading && !error && schemas.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-2">No schemas found.</p>
        )}

        {schemas.map((schema) => (
          <div key={schema.name}>
            <div
              className="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:bg-sidebar-accent text-xs text-sidebar-foreground group"
              onClick={() => toggleSchema(schema.name)}
            >
              {schema.loading ? (
                <RefreshCw size={11} className="animate-spin text-muted-foreground" />
              ) : schema.expanded ? (
                <ChevronDown size={11} className="text-muted-foreground" />
              ) : (
                <ChevronRight size={11} className="text-muted-foreground" />
              )}
              <Database size={12} className="text-primary/70 shrink-0" />
              <span className="truncate flex-1">{schema.name}</span>
              {schema.expanded && (
                <span className="text-[10px] text-muted-foreground/50">{schema.tables.length}</span>
              )}
              <button
                onClick={(e) => openErd(schema.name, e)}
                className="hidden group-hover:flex items-center text-muted-foreground hover:text-primary ml-1"
                title={`ERD: ${schema.name}`}
              >
                <Network size={10} />
              </button>
            </div>

            {schema.expanded &&
              schema.tables.map((table) => {
                const isView = table.table_type.includes("VIEW");
                return (
                  <div
                    key={table.name}
                    className="flex items-center gap-1.5 pl-7 pr-3 py-0.5 cursor-pointer hover:bg-sidebar-accent text-xs text-sidebar-foreground/80"
                    onClick={() => openDataBrowser(schema.name, table.name)}
                  >
                    {isView ? (
                      <Eye size={11} className="text-blue-400 shrink-0" />
                    ) : (
                      <Table2 size={11} className="text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate">{table.name}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
