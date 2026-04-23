import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Download, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportResult {
  connections_imported: number;
  queries_imported: number;
}

interface ExportOptions {
  include_connections: boolean;
  include_queries: boolean;
}

interface Props {
  tab: Tab;
}

export function WorkspaceManager({ tab: _tab }: Props) {
  const [mode, setMode] = useState<"export" | "import">("export");

  const [exportPath, setExportPath] = useState("");
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    include_connections: true,
    include_queries: true,
  });
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState("");

  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  const handleExport = async () => {
    if (!exportPath.trim()) { setExportError("Enter a file path"); return; }
    setExporting(true);
    setExportError("");
    setExportDone(false);
    try {
      await invoke("export_workspace", {
        path: exportPath.trim(),
        includeConnections: exportOpts.include_connections,
        includeQueries: exportOpts.include_queries,
      });
      setExportDone(true);
    } catch (e) {
      setExportError(String(e));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importPath.trim()) { setImportError("Enter a file path"); return; }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await invoke<ImportResult>("import_workspace", { path: importPath.trim() });
      setImportResult(result);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <Package size={14} className="text-primary" />
        <span className="text-sm font-medium">Workspace Manager</span>
        <div className="flex gap-1 ml-4">
          {(["export", "import"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "text-xs px-2 py-0.5 rounded capitalize",
                mode === m
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {mode === "export" && (
          <div className="max-w-md space-y-5">
            <div>
              <h3 className="text-sm font-semibold mb-1">Export Workspace</h3>
              <p className="text-xs text-muted-foreground">
                Save your connections and saved queries to a JSON file. Passwords are NOT exported.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">What to export</Label>
              <div className="space-y-1.5">
                {([
                  ["include_connections", "Connections (without passwords)"],
                  ["include_queries", "Saved queries"],
                ] as [keyof ExportOptions, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOpts[key]}
                      onChange={(e) => setExportOpts({ ...exportOpts, [key]: e.target.checked })}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Export path</Label>
              <Input
                value={exportPath}
                onChange={(e) => setExportPath(e.target.value)}
                placeholder="/path/to/workspace.json"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Enter the full file path where the workspace will be saved.</p>
            </div>

            {exportError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 rounded p-2 border border-destructive/20">
                <AlertCircle size={12} />
                {exportError}
              </div>
            )}

            {exportDone && (
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded p-2">
                <CheckCircle size={12} />
                Exported to <span className="font-mono truncate">{exportPath}</span>
              </div>
            )}

            <Button onClick={handleExport} disabled={exporting} size="sm" className="text-xs">
              <Download size={12} className="mr-1.5" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
        )}

        {mode === "import" && (
          <div className="max-w-md space-y-5">
            <div>
              <h3 className="text-sm font-semibold mb-1">Import Workspace</h3>
              <p className="text-xs text-muted-foreground">
                Load connections and saved queries from a previously exported workspace file.
                Existing records (by ID) are preserved — only new items are added.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Workspace file path</Label>
              <Input
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                placeholder="/path/to/workspace.json"
                className="h-8 text-xs"
              />
            </div>

            {importError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 rounded p-2 border border-destructive/20">
                <AlertCircle size={12} />
                {importError}
              </div>
            )}

            {importResult && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded p-3 border border-green-500/20 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle size={12} />
                  Import complete
                </div>
                <p>Connections imported: <strong>{importResult.connections_imported}</strong></p>
                <p>Saved queries imported: <strong>{importResult.queries_imported}</strong></p>
              </div>
            )}

            <Button onClick={handleImport} disabled={importing} size="sm" className="text-xs">
              <Upload size={12} className="mr-1.5" />
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
