import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { Plus, Trash2, RefreshCw, Shield, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PgRole {
  rolname: string;
  rolsuper: boolean;
  rolinherit: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolcanlogin: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  rolconnlimit: number;
  rolvaliduntil: string | null;
}

interface RoleMembership {
  role: string;
  member: string;
  granted_by: string;
  admin_option: boolean;
}

function BoolCell({ value }: { value: boolean }) {
  return value
    ? <CheckCircle size={12} className="text-green-500" />
    : <XCircle size={12} className="text-muted-foreground/30" />;
}

interface CreateRoleFormState {
  name: string;
  password: string;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  inherit: boolean;
  login: boolean;
  replication: boolean;
  bypass_rls: boolean;
  conn_limit: string;
  valid_until: string;
}

const defaultForm: CreateRoleFormState = {
  name: "", password: "", superuser: false, createdb: false, createrole: false,
  inherit: true, login: true, replication: false, bypass_rls: false, conn_limit: "", valid_until: "",
};

interface Props {
  tab: Tab;
}

export function RoleManager({ tab }: Props) {
  const [roles, setRoles] = useState<PgRole[]>([]);
  const [memberships, setMemberships] = useState<RoleMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateRoleFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [view, setView] = useState<"roles" | "memberships">("roles");

  const fetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, m] = await Promise.all([
        invoke<PgRole[]>("get_roles", { connectionId: tab.connectionId }),
        invoke<RoleMembership[]>("get_role_memberships", { connectionId: tab.connectionId }),
      ]);
      setRoles(r);
      setMemberships(m);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = async () => {
    if (!form.name.trim()) { setSaveError("Name is required"); return; }
    setSaving(true);
    setSaveError("");
    try {
      await invoke("create_role", {
        connectionId: tab.connectionId,
        options: {
          name: form.name.trim(),
          password: form.password || null,
          superuser: form.superuser,
          createdb: form.createdb,
          createrole: form.createrole,
          inherit: form.inherit,
          login: form.login,
          replication: form.replication,
          bypass_rls: form.bypass_rls,
          conn_limit: form.conn_limit ? parseInt(form.conn_limit) : null,
          valid_until: form.valid_until || null,
        },
      });
      setCreateOpen(false);
      setForm(defaultForm);
      fetch();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (name: string) => {
    if (!confirm(`Drop role "${name}"? This cannot be undone.`)) return;
    try {
      await invoke("drop_role", { connectionId: tab.connectionId, name });
      fetch();
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <Shield size={14} className="text-primary" />
        <span className="text-sm font-medium">User & Role Management</span>
        <div className="flex gap-1 ml-3">
          {(["roles", "memberships"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "text-xs px-2 py-0.5 rounded capitalize",
                view === v ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {v} ({v === "roles" ? roles.length : memberships.length})
            </button>
          ))}
        </div>
        <button
          onClick={() => { setCreateOpen(true); setForm(defaultForm); setSaveError(""); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          <Plus size={12} />
          New Role
        </button>
        <button onClick={fetch} disabled={loading} className="text-muted-foreground hover:text-foreground">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20 shrink-0">
          {error}
        </div>
      )}

      {view === "roles" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                {["Name", "Login", "Super", "CreateDB", "CreateRole", "Inherit", "Replication", "BypassRLS", "Conn Limit", "Valid Until", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.rolname} className="hover:bg-accent/40 border-b border-border/30 group">
                  <td className="px-3 py-1.5 font-medium font-mono">{r.rolname}</td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolcanlogin} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolsuper} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolcreatedb} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolcreaterole} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolinherit} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolreplication} /></td>
                  <td className="px-3 py-1.5"><BoolCell value={r.rolbypassrls} /></td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.rolconnlimit === -1 ? "∞" : r.rolconnlimit}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.rolvaliduntil ?? "never"}</td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => handleDrop(r.rolname)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title="Drop role"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "memberships" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr>
                {["Role", "Member", "Granted By", "Admin Option"].map((h) => (
                  <th key={h} className="text-left px-3 py-1.5 font-medium border-b border-border text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberships.map((m, i) => (
                <tr key={i} className="hover:bg-accent/40 border-b border-border/30">
                  <td className="px-3 py-1.5 font-mono font-medium">{m.role}</td>
                  <td className="px-3 py-1.5 font-mono">{m.member}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{m.granted_by}</td>
                  <td className="px-3 py-1.5"><BoolCell value={m.admin_option} /></td>
                </tr>
              ))}
              {memberships.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No role memberships.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create role dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus size={14} />Create Role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" autoFocus />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-8 text-xs" placeholder="Leave blank for no password" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Connection Limit</Label>
                <Input value={form.conn_limit} onChange={(e) => setForm({ ...form, conn_limit: e.target.value })} className="h-8 text-xs" placeholder="-1 = unlimited" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid Until</Label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["login", "Can Login"],
                ["superuser", "Superuser"],
                ["createdb", "Create DB"],
                ["createrole", "Create Role"],
                ["inherit", "Inherit"],
                ["replication", "Replication"],
                ["bypass_rls", "Bypass RLS"],
              ] as [keyof CreateRoleFormState, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} className="text-xs">Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} className="text-xs">{saving ? "Creating…" : "Create Role"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
