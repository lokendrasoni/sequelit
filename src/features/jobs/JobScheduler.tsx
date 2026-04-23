import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConnectionStore } from "@/stores/connectionStore";
import { Plus, Trash2, Play, RefreshCw, Clock, ToggleLeft, ToggleRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Job {
  id: string;
  connection_id: string | null;
  name: string;
  sql: string;
  schedule: string;
  enabled: boolean;
  last_run: string | null;
  last_status: string | null;
  created_at: string;
}

const SCHEDULE_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 minutes", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
  { label: "Monthly (1st)", value: "0 0 1 * *" },
];

interface FormState {
  id: string | null;
  name: string;
  connection_id: string;
  sql: string;
  schedule: string;
  enabled: boolean;
}

const defaultForm: FormState = {
  id: null, name: "", connection_id: "", sql: "", schedule: "0 * * * *", enabled: true,
};

export function JobScheduler() {
  const connections = useConnectionStore((s) => s.connections);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<Job[]>("get_jobs");
      setJobs(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError("Name required"); return; }
    if (!form.sql.trim()) { setSaveError("SQL required"); return; }
    setSaving(true);
    setSaveError("");
    try {
      await invoke("save_job", {
        input: {
          id: form.id,
          connection_id: form.connection_id || null,
          name: form.name.trim(),
          sql: form.sql.trim(),
          schedule: form.schedule.trim(),
          enabled: form.enabled,
        },
      });
      setOpen(false);
      setForm(defaultForm);
      fetchJobs();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this job?")) return;
    await invoke("delete_job", { id });
    fetchJobs();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await invoke("toggle_job", { id, enabled: !enabled });
    fetchJobs();
  };

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      const result = await invoke<string>("run_job_now", { id });
      setRunResult((r) => ({ ...r, [id]: result }));
      fetchJobs();
    } catch (e) {
      setRunResult((r) => ({ ...r, [id]: `Error: ${e}` }));
    } finally {
      setRunningId(null);
    }
  };

  const editJob = (job: Job) => {
    setForm({
      id: job.id,
      name: job.name,
      connection_id: job.connection_id ?? "",
      sql: job.sql,
      schedule: job.schedule,
      enabled: job.enabled,
    });
    setSaveError("");
    setOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <Clock size={14} className="text-primary" />
        <span className="text-sm font-medium">Job Scheduler</span>
        <button
          onClick={() => { setForm(defaultForm); setSaveError(""); setOpen(true); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          <Plus size={12} /> New Job
        </button>
        <button onClick={fetchJobs} disabled={loading} className="text-muted-foreground hover:text-foreground">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {jobs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Clock size={32} className="opacity-20" />
            <p className="text-sm">No scheduled jobs yet.</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => { setForm(defaultForm); setOpen(true); }}>
              <Plus size={12} className="mr-1" />Create your first job
            </Button>
          </div>
        )}
        <div className="p-3 space-y-2">
          {jobs.map((job) => {
            const conn = connections.find((c) => c.id === job.connection_id);
            const lastOk = job.last_status?.startsWith("OK");
            return (
              <div
                key={job.id}
                className={cn(
                  "rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-accent/20 transition-colors",
                  !job.enabled && "opacity-60"
                )}
                onClick={() => editJob(job)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{job.name}</span>
                      {conn && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${conn.color_tag ?? "#6b7280"}20`, color: conn.color_tag ?? "#6b7280" }}
                        >
                          {conn.name}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{job.sql}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="font-mono">{job.schedule}</span>
                      {job.last_run && (
                        <span>Last: {new Date(job.last_run).toLocaleString()}</span>
                      )}
                      {job.last_status && (
                        <span className={lastOk ? "text-green-500" : "text-red-400"}>
                          {job.last_status.slice(0, 60)}
                        </span>
                      )}
                    </div>
                    {runResult[job.id] && (
                      <p className={cn("text-[10px] mt-1", runResult[job.id].startsWith("OK") ? "text-green-500" : "text-red-400")}>
                        {runResult[job.id]}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRunNow(job.id)}
                      disabled={runningId === job.id}
                      className="text-muted-foreground hover:text-primary"
                      title="Run now"
                    >
                      {runningId === job.id
                        ? <RefreshCw size={13} className="animate-spin" />
                        : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => handleToggle(job.id, job.enabled)}
                      className={cn("transition-colors", job.enabled ? "text-green-500 hover:text-muted-foreground" : "text-muted-foreground hover:text-green-500")}
                      title={job.enabled ? "Disable" : "Enable"}
                    >
                      {job.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock size={14} />
              {form.id ? "Edit Job" : "New Job"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Connection</Label>
              <select
                value={form.connection_id}
                onChange={(e) => setForm({ ...form, connection_id: e.target.value })}
                className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">No connection (SQL only)</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SQL *</Label>
              <textarea
                value={form.sql}
                onChange={(e) => setForm({ ...form, sql: e.target.value })}
                rows={4}
                className="w-full text-xs font-mono bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none"
                placeholder="SELECT 1; -- or any SQL statement"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Schedule (cron)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  className="h-8 text-xs font-mono flex-1"
                  placeholder="0 * * * *"
                />
                <select
                  onChange={(e) => e.target.value && setForm({ ...form, schedule: e.target.value })}
                  className="text-xs bg-background border border-border rounded px-2 py-1 outline-none"
                  value=""
                >
                  <option value="">Presets…</option>
                  {SCHEDULE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <p className="text-[10px] text-muted-foreground">Cron format: min hour day month weekday</p>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
              Enabled
            </label>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs">Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs">{saving ? "Saving…" : "Save Job"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
