import { useState } from "react";
import { ChevronRight, ChevronDown, X } from "lucide-react";

interface Props {
  row: Record<string, unknown>;
  onClose: () => void;
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null) return <span className="text-muted-foreground/60 italic text-xs">null</span>;
  if (typeof value === "boolean") return <span className="text-purple-400 text-xs">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-blue-400 text-xs">{value}</span>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return <JsonNode value={parsed} depth={depth} />;
      }
    } catch {}
    return <span className="text-green-400 text-xs">"{value}"</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground text-xs">[]</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="text-xs">[{value.length}]</span>
        </button>
        {open && (
          <div className="ml-4 border-l border-border/40 pl-2 mt-0.5 space-y-0.5">
            {value.map((v, i) => (
              <div key={i} className="flex gap-1 items-start">
                <span className="text-[10px] text-muted-foreground/50 font-mono min-w-[1.5rem] text-right">{i}</span>
                <JsonNode value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground text-xs">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="text-xs">{"{"}…{"}"}</span>
        </button>
        {open && (
          <div className="ml-4 border-l border-border/40 pl-2 mt-0.5 space-y-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1.5 items-start">
                <span className="text-[10px] text-orange-300 font-mono shrink-0">{k}:</span>
                <JsonNode value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span className="text-xs font-mono">{String(value)}</span>;
}

export function JsonSidebar({ row, onClose }: Props) {
  return (
    <div className="w-72 border-l border-border flex flex-col shrink-0 bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium">Row JSON</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        <div className="space-y-1">
          {Object.entries(row).map(([key, val]) => (
            <div key={key} className="flex gap-1.5 items-start min-w-0">
              <span className="text-[10px] text-orange-300 shrink-0 pt-px">{key}:</span>
              <JsonNode value={val} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
