import { X, Plus } from "lucide-react";
import { useTabStore } from "@/stores/tabStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { cn } from "@/lib/utils";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openTab } = useTabStore();
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);

  const handleNewQueryTab = () => {
    if (!activeConnectionId) return;
    openTab({
      type: "query",
      title: "Query",
      connectionId: activeConnectionId,
    });
  };

  if (tabs.length === 0) {
    return (
      <div className="h-9 flex items-center border-b border-border px-2 bg-sidebar shrink-0">
        {activeConnectionId && (
          <button
            onClick={handleNewQueryTab}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
          >
            <Plus size={13} />
            New Query
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center border-b border-border bg-sidebar shrink-0 overflow-x-auto">
      <div className="flex items-center min-w-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-border shrink-0 max-w-[180px]",
              "hover:bg-accent transition-colors",
              activeTabId === tab.id
                ? "bg-background text-foreground border-b-2 border-b-primary"
                : "text-muted-foreground"
            )}
          >
            <span className="truncate">{tab.title}</span>
            {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={handleNewQueryTab}
        disabled={!activeConnectionId}
        className="px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 shrink-0"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
