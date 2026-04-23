import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "backup" | "restore";

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  mode: Mode;
}

const FORMAT_OPTIONS = [
  { value: "plain", label: "Plain SQL (.sql)" },
  { value: "custom", label: "Custom (-Fc)" },
  { value: "tar", label: "Tar (-Ft)" },
  { value: "directory", label: "Directory (-Fd)" },
];

export function BackupDialog({ open, onClose, connectionId, mode }: Props) {
  const [path, setPath] = useState("");
  const [format, setFormat] = useState("plain");
  const [cmd, setCmd] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const generateCmd = async () => {
    if (!path.trim()) { setError("Enter a file/directory path"); return; }
    setError("");
    try {
      if (mode === "backup") {
        const c = await invoke<string>("get_pg_dump_cmd", {
          connectionId,
          outputPath: path.trim(),
          format,
        });
        setCmd(c);
      } else {
        const c = await invoke<string>("get_pg_restore_cmd", {
          connectionId,
          filePath: path.trim(),
        });
        setCmd(c);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setPath(""); setCmd(""); setError(""); setCopied(false); setFormat("plain");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive size={15} />
            {mode === "backup" ? "Backup Database (pg_dump)" : "Restore Database (pg_restore)"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sequelit generates the shell command — run it in your terminal. Make sure{" "}
            <span className="font-mono">{mode === "backup" ? "pg_dump" : "pg_restore"}</span> is installed.
          </p>

          {mode === "backup" && (
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFormat(f.value)}
                    className={cn(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      format === f.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">
              {mode === "backup" ? "Output Path" : "Backup File Path"}
            </Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={mode === "backup" ? "/path/to/backup.sql" : "/path/to/backup.dump"}
              className="h-8 text-xs font-mono"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">Cancel</Button>
            <Button size="sm" onClick={generateCmd} className="text-xs">Generate Command</Button>
          </div>

          {cmd && (
            <div className="space-y-1">
              <Label className="text-xs">Shell Command</Label>
              <div className="relative">
                <pre className="text-[10px] font-mono bg-muted rounded p-3 pr-10 whitespace-pre-wrap break-all">
                  {cmd}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                  title="Copy"
                >
                  {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Run this in your terminal. Set PGPASSWORD or use a .pgpass file for the password.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
