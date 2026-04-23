import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookMarked, Trash2, Play, Tag } from "lucide-react";

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string | null;
  tags?: string | null;
}

interface Props {
  connectionId: string;
  onLoad: (sql: string) => void;
  onClose: () => void;
}

export function SavedQueriesPanel({ connectionId, onLoad, onClose }: Props) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<SavedQuery[]>("get_saved_queries", { connectionId }).then(setQueries).catch(() => {});
  }, [connectionId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("delete_saved_query", { id });
    setQueries((q) => q.filter((x) => x.id !== id));
  };

  const filtered = search.trim()
    ? queries.filter(
        (q) =>
          q.name.toLowerCase().includes(search.toLowerCase()) ||
          q.sql.toLowerCase().includes(search.toLowerCase()) ||
          (q.tags ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : queries;

  return (
    <div className="absolute inset-0 bg-background/95 z-20 flex flex-col border border-border rounded overflow-hidden backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <BookMarked size={14} className="text-primary" />
          <span className="text-sm font-medium">Saved Queries</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
          Close
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search queries…"
          className="w-full text-xs bg-muted rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-4 text-center">
            {queries.length === 0 ? "No saved queries yet." : "No matches."}
          </p>
        )}
        {filtered.map((q) => (
          <div
            key={q.id}
            onClick={() => { onLoad(q.sql); onClose(); }}
            className="px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-accent group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{q.name}</p>
                {q.description && (
                  <p className="text-[10px] text-muted-foreground truncate">{q.description}</p>
                )}
                <p className="font-mono text-[10px] text-muted-foreground/70 truncate mt-0.5">
                  {q.sql}
                </p>
                {q.tags && (
                  <div className="flex items-center gap-1 mt-1">
                    <Tag size={9} className="text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground/60">{q.tags}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onLoad(q.sql); onClose(); }}
                  className="text-muted-foreground hover:text-primary p-0.5 rounded"
                  title="Load"
                >
                  <Play size={11} />
                </button>
                <button
                  onClick={(e) => handleDelete(q.id, e)}
                  className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
