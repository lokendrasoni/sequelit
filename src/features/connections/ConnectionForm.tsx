import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnectionStore, ConnectionConfig } from "@/stores/connectionStore";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

type DbType = "postgres" | "mysql" | "sqlite" | "cockroachdb" | "redshift";

interface FormState {
  name: string;
  db_type: DbType;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  color_tag: string;
  group_name: string;
  ssh_enabled: boolean;
  ssh_host: string;
  ssh_port: string;
  ssh_user: string;
  ssh_key_path: string;
}

const DB_DEFAULTS: Record<DbType, { port: number; userPlaceholder: string }> = {
  postgres:    { port: 5432,  userPlaceholder: "postgres" },
  mysql:       { port: 3306,  userPlaceholder: "root" },
  sqlite:      { port: 0,     userPlaceholder: "" },
  cockroachdb: { port: 26257, userPlaceholder: "root" },
  redshift:    { port: 5439,  userPlaceholder: "awsuser" },
};

const COLOR_OPTIONS = [
  { value: "#ef4444", label: "Red (Production)" },
  { value: "#f97316", label: "Orange (Staging)" },
  { value: "#22c55e", label: "Green (Development)" },
  { value: "#3b82f6", label: "Blue (Testing)" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#6b7280", label: "Gray" },
];

const PG_COMPAT_NOTE: Partial<Record<DbType, string>> = {
  cockroachdb: "CockroachDB uses the PostgreSQL wire protocol — connects via the postgres driver.",
  redshift: "Amazon Redshift uses the PostgreSQL wire protocol — connects via the postgres driver.",
};

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: ConnectionConfig & { id?: string };
}

function makeDefault(initial?: ConnectionConfig & { id?: string }): FormState {
  return {
    name:        initial?.name ?? "",
    db_type:     (initial?.db_type as DbType) ?? "postgres",
    host:        initial?.host ?? "localhost",
    port:        String(initial?.port ?? 5432),
    database:    initial?.database ?? "",
    username:    initial?.username ?? "",
    password:    "",
    color_tag:   initial?.color_tag ?? "_none",
    group_name:  initial?.group_name ?? "",
    ssh_enabled: !!(initial?.ssh_host),
    ssh_host:    initial?.ssh_host ?? "",
    ssh_port:    String(initial?.ssh_port ?? 22),
    ssh_user:    initial?.ssh_user ?? "",
    ssh_key_path: initial?.ssh_key_path ?? "",
  };
}

export function ConnectionForm({ open, onClose, initial }: Props) {
  const { saveConnection, testConnection } = useConnectionStore();
  const [form, setForm] = useState<FormState>(() => makeDefault(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens / initial changes
  useEffect(() => {
    if (open) {
      setForm(makeDefault(initial));
      setErrors({});
      setTestState("idle");
      setTestMsg("");
    }
  }, [open, initial]);

  const set = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const changeDbType = (v: DbType) => {
    const defaults = DB_DEFAULTS[v];
    setForm((prev) => ({
      ...prev,
      db_type: v,
      port: v === "sqlite" ? "" : String(defaults.port),
    }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildConfig = (): ConnectionConfig => ({
    name:         form.name.trim(),
    db_type:      form.db_type,
    host:         form.host || undefined,
    port:         form.port ? Number(form.port) : undefined,
    database:     form.database || undefined,
    username:     form.username || undefined,
    password:     form.password || undefined,
    color_tag:    form.color_tag === "_none" ? undefined : form.color_tag || undefined,
    group_name:   form.group_name || undefined,
    ssh_host:     form.ssh_enabled && form.ssh_host ? form.ssh_host : undefined,
    ssh_port:     form.ssh_enabled && form.ssh_port ? Number(form.ssh_port) : undefined,
    ssh_user:     form.ssh_enabled && form.ssh_user ? form.ssh_user : undefined,
    ssh_key_path: form.ssh_enabled && form.ssh_key_path ? form.ssh_key_path : undefined,
  });

  const onTest = async () => {
    setTestState("loading");
    try {
      const msg = await testConnection(buildConfig());
      setTestState("ok");
      setTestMsg(msg);
    } catch (e) {
      setTestState("fail");
      setTestMsg(String(e));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await saveConnection({ ...buildConfig(), id: initial?.id });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isSqlite = form.db_type === "sqlite";
  const pgNote = PG_COMPAT_NOTE[form.db_type];
  const showSshSection = !isSqlite;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Connection" : "New Connection"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Connection Name</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="My Database"
                className="h-8 text-xs"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Database Type</Label>
              <Select value={form.db_type} onValueChange={(v) => changeDbType(v as DbType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL / MariaDB</SelectItem>
                  <SelectItem value="sqlite">SQLite</SelectItem>
                  <SelectItem value="cockroachdb">CockroachDB</SelectItem>
                  <SelectItem value="redshift">Amazon Redshift</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Color Label</Label>
              <Select value={form.color_tag} onValueChange={(v) => set("color_tag", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {pgNote && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 border border-border/50">
              {pgNote}
            </p>
          )}

          {isSqlite ? (
            <div className="space-y-1">
              <Label className="text-xs">Database File Path</Label>
              <Input
                value={form.database}
                onChange={(e) => set("database", e.target.value)}
                placeholder="/path/to/database.db"
                className="h-8 text-xs"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Host</Label>
                  <Input
                    value={form.host}
                    onChange={(e) => set("host", e.target.value)}
                    placeholder="localhost"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input
                    value={form.port}
                    onChange={(e) => set("port", e.target.value)}
                    type="number"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Database</Label>
                <Input
                  value={form.database}
                  onChange={(e) => set("database", e.target.value)}
                  placeholder="my_database"
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Username</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    placeholder={DB_DEFAULTS[form.db_type]?.userPlaceholder ?? ""}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password</Label>
                  <Input
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Group (optional)</Label>
            <Input
              value={form.group_name}
              onChange={(e) => set("group_name", e.target.value)}
              placeholder="Production, Staging…"
              className="h-8 text-xs"
            />
          </div>

          {showSshSection && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, ssh_enabled: !prev.ssh_enabled }))}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {form.ssh_enabled ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="font-medium">SSH Tunnel / Bastion Host</span>
                {form.ssh_enabled && (
                  <span className="text-[10px] text-primary bg-primary/10 px-1.5 rounded">enabled</span>
                )}
              </button>

              {form.ssh_enabled && (
                <div className="space-y-2 pl-3 border-l-2 border-border">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">SSH Host</Label>
                      <Input
                        value={form.ssh_host}
                        onChange={(e) => set("ssh_host", e.target.value)}
                        placeholder="bastion.example.com"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SSH Port</Label>
                      <Input
                        value={form.ssh_port}
                        onChange={(e) => set("ssh_port", e.target.value)}
                        type="number"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">SSH Username</Label>
                    <Input
                      value={form.ssh_user}
                      onChange={(e) => set("ssh_user", e.target.value)}
                      placeholder="ubuntu"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Private Key Path</Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={form.ssh_key_path}
                        onChange={(e) => set("ssh_key_path", e.target.value)}
                        placeholder="~/.ssh/id_rsa"
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <button
                        type="button"
                        title="Browse for key file"
                        onClick={async () => {
                          const selected = await openFileDialog({
                            multiple: false,
                            directory: false,
                            title: "Select SSH Private Key",
                          });
                          if (typeof selected === "string") set("ssh_key_path", selected);
                        }}
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors"
                      >
                        <FolderOpen size={13} className="text-muted-foreground" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Leave blank to use your default SSH key or ssh-agent.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {testState !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-2 text-xs rounded p-2",
                testState === "ok"      && "bg-green-500/10 text-green-600 dark:text-green-400",
                testState === "fail"    && "bg-destructive/10 text-destructive",
                testState === "loading" && "bg-muted text-muted-foreground"
              )}
            >
              {testState === "loading" && <Loader2 size={12} className="animate-spin" />}
              {testState === "ok"      && <CheckCircle size={12} />}
              {testState === "fail"    && <XCircle size={12} />}
              <span className="truncate">{testState === "loading" ? "Testing…" : testMsg}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={testState === "loading"} className="text-xs h-7">
              Test Connection
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs h-7">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs h-7">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
