import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  schema: string;
  table: string;
  onImported: () => void;
}

export function ImportDialog({ open, onClose, connectionId, schema, table, onImported }: Props) {
  const [filePath, setFilePath] = useState("");
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFilePath((f as File & { path?: string }).path ?? f.name);
  };

  const handleImport = async () => {
    if (!filePath) { setError("Select a CSV file"); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const rows = await invoke<number>("import_csv", {
        connectionId,
        schema,
        table,
        filePath,
        hasHeader,
        delimiter: delimiter || ",",
      });
      setResult(`${rows} row${rows !== 1 ? "s" : ""} imported successfully.`);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFilePath(""); setDelimiter(","); setHasHeader(true);
    setResult(null); setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={15} />
            Import CSV → {schema}.{table}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">CSV File</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={filePath}
                placeholder="Select a .csv file…"
                className="h-8 text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                className="text-xs"
              >
                <FileText size={12} className="mr-1" />
                Browse
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Delimiter</Label>
              <Input
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value.slice(0, 1))}
                placeholder=","
                className="h-8 text-xs"
                maxLength={1}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Header row</Label>
              <div className="h-8 flex items-center">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                  className="rounded"
                  id="has-header"
                />
                <label htmlFor="has-header" className="ml-2 text-xs cursor-pointer">First row is header</label>
              </div>
            </div>
          </div>

          {result && (
            <p className="text-xs text-green-500 bg-green-500/10 rounded px-2 py-1">{result}</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">Cancel</Button>
            <Button size="sm" onClick={handleImport} disabled={loading || !filePath} className="text-xs">
              {loading ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
