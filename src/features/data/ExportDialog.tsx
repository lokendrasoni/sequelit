import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, FolderOpen, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ExportRequest {
  schema: string;
  table: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  tables: ExportRequest[];
}

export function ExportDialog({ open, onClose, connectionId, tables }: Props) {
  const [outputDir, setOutputDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleExport = async () => {
    if (!outputDir.trim()) { setError("Specify an output directory"); return; }
    setLoading(true);
    setError("");
    setExported([]);
    try {
      const files = await invoke<string[]>("export_tables_csv", {
        connectionId,
        tables,
        outputDir: outputDir.trim(),
      });
      setExported(files);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOutputDir(""); setExported([]); setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download size={15} />
            Export to CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {tables.length === 1
              ? `Exporting: ${tables[0].schema}.${tables[0].table}`
              : `Exporting ${tables.length} tables`}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Output Directory</Label>
            <div className="flex gap-2">
              <Input
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder="/Users/you/exports"
                className="h-8 text-xs flex-1"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Files will be saved as <span className="font-mono">schema_table.csv</span>
            </p>
          </div>

          {exported.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                <Check size={12} /> Export complete
              </p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {exported.map((f) => (
                  <p key={f} className="text-[10px] font-mono text-muted-foreground truncate">
                    <FolderOpen size={9} className="inline mr-1" />{f}
                  </p>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">Close</Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={loading || !outputDir.trim()}
              className="text-xs"
            >
              {loading ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
