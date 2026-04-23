import { useState } from "react";
import { Plus, Plug, PlugZap, Pencil, Trash2, RefreshCw, HardDrive, Check, X } from "lucide-react";
import { useConnectionStore, SavedConnection } from "@/stores/connectionStore";
import { useTabStore } from "@/stores/tabStore";
import { ConnectionForm } from "./ConnectionForm";
import { BackupDialog } from "./BackupDialog";
import { cn } from "@/lib/utils";

const DB_ICONS: Record<string, string> = {
  postgres: "PG",
  mysql: "MY",
  sqlite: "SL",
};

export function ConnectionList() {
  const {
    connections,
    activeConnectionId,
    connectedIds,
    connect,
    disconnect,
    deleteConnection,
    setActiveConnection,
    loadConnections,
  } = useConnectionStore();
  const { closeTabsByConnection } = useTabStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedConnection | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [backupTarget, setBackupTarget] = useState<{ id: string; mode: "backup" | "restore" } | null>(null);

  const handleConnect = async (c: SavedConnection) => {
    if (connectedIds.includes(c.id)) {
      setActiveConnection(c.id);
      return;
    }
    setConnecting(c.id);
    try {
      await connect(c.id);
      setActiveConnection(c.id);
    } catch (e) {
      alert(`Connection failed: ${e}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    await disconnect(id);
    closeTabsByConnection(id);
    if (activeConnectionId === id) setActiveConnection(null);
  };

  const handleDelete = async (id: string) => {
    await handleDisconnect(id);
    await deleteConnection(id);
    setDeleteConfirmId(null);
  };

  const groups = connections.reduce<Record<string, SavedConnection[]>>((acc, c) => {
    const g = c.group_name || "";
    acc[g] = acc[g] || [];
    acc[g].push(c);
    return acc;
  }, {});

  return (
    <div className="flex flex-col min-h-0">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Connections
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadConnections()}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={11} />
          </button>
          <button
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
            className="text-muted-foreground hover:text-foreground"
            title="New connection"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 pb-1">
        {connections.length === 0 && (
          <div className="text-center py-4 text-xs text-muted-foreground px-3">
            No connections yet.
            <br />
            <button
              onClick={() => { setEditTarget(null); setFormOpen(true); }}
              className="text-primary underline mt-1"
            >
              Add your first connection
            </button>
          </div>
        )}

        {Object.entries(groups).map(([group, conns]) => (
          <div key={group}>
            {group && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group}
              </div>
            )}
            {conns.map((c) => {
              const isActive = c.id === activeConnectionId;
              const isConnected = connectedIds.includes(c.id);
              const isConnecting = connecting === c.id;

              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs",
                    "hover:bg-sidebar-accent transition-colors",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                  onClick={() => handleConnect(c)}
                >
                  {/* Color dot */}
                  <span
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: c.color_tag || "#6b7280" }}
                  />

                  {/* DB type badge */}
                  <span className="shrink-0 text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground">
                    {DB_ICONS[c.db_type] ?? c.db_type.toUpperCase().slice(0, 2)}
                  </span>

                  {/* Name */}
                  <span className="flex-1 truncate text-sidebar-foreground">{c.name}</span>

                  {/* Connected indicator */}
                  {isConnecting && (
                    <span className="text-[10px] text-muted-foreground animate-pulse">…</span>
                  )}
                  {isConnected && !isConnecting && (
                    <PlugZap size={11} className="text-green-500 shrink-0" />
                  )}

                  {/* Delete confirmation inline */}
                  {deleteConfirmId === c.id ? (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] text-destructive">Delete?</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                        className="text-destructive hover:text-destructive/80"
                        title="Confirm delete"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Cancel"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    /* Actions (hover) */
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                      {isConnected && c.db_type === "postgres" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setBackupTarget({ id: c.id, mode: "backup" }); }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Backup"
                        >
                          <HardDrive size={11} />
                        </button>
                      )}
                      {isConnected && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDisconnect(c.id); }}
                          className="text-muted-foreground hover:text-destructive"
                          title="Disconnect"
                        >
                          <Plug size={11} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditTarget(c); setFormOpen(true); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id); }}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ConnectionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        initial={editTarget ?? undefined}
      />

      {backupTarget && (
        <BackupDialog
          open
          onClose={() => setBackupTarget(null)}
          connectionId={backupTarget.id}
          mode={backupTarget.mode}
        />
      )}
    </div>
  );
}
