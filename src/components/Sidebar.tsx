import { useState } from "react";
import { ConnectionList } from "@/features/connections/ConnectionList";
import { SchemaBrowser } from "@/features/schema/SchemaBrowser";
import { PreferencesDialog } from "@/features/preferences/PreferencesDialog";
import { useConnectionStore } from "@/stores/connectionStore";
import { useTabStore } from "@/stores/tabStore";
import { cn } from "@/lib/utils";
import {
  Database, ChevronLeft, ChevronRight, Activity, BarChart2,
  Shield, Settings, Terminal, Clock, Bot, Package, Lock, ChevronDown,
} from "lucide-react";

type ToolTabType = "dashboard" | "activity" | "roles" | "pg-config" | "terminal" | "jobs" | "ai" | "workspace" | "pg-management";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(true);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connectedIds = useConnectionStore((s) => s.connectedIds);
  const { openTab } = useTabStore();

  const isConnected = activeConnectionId ? connectedIds.includes(activeConnectionId) : false;

  const openConnTab = (type: ToolTabType, title: string) => {
    if (!activeConnectionId) return;
    openTab({ type, title, connectionId: activeConnectionId });
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-sidebar transition-all duration-200 shrink-0",
        collapsed ? "w-0 overflow-hidden" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-primary" />
          <span className="text-sm font-semibold text-sidebar-foreground">Sequelit</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ConnectionList />
        <SchemaBrowser />

        {/* Tools — only when connected */}
        {isConnected && (
          <div className="border-t border-sidebar-border shrink-0 pb-1">
            <button
              onClick={() => setToolsExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-3 py-1.5 group"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </span>
              <ChevronDown
                size={11}
                className={cn(
                  "text-muted-foreground transition-transform",
                  !toolsExpanded && "-rotate-90"
                )}
              />
            </button>
            {toolsExpanded && <div className="space-y-0.5 px-1">
              {([
                ["dashboard", BarChart2, "Dashboard"],
                ["activity", Activity, "Activity Monitor"],
                ["roles", Shield, "Roles & Users"],
                ["pg-config", Settings, "PG Config"],
                ["terminal", Terminal, "SQL Shell"],
                ["jobs", Clock, "Job Scheduler"],
                ["ai", Bot, "AI Assistant"],
                ["workspace", Package, "Workspace"],
                ["pg-management", Lock, "PG Management"],
              ] as [ToolTabType, React.ElementType, string][]).map(([type, Icon, label]) => (
                <button
                  key={type}
                  onClick={() => openConnTab(type, label)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-left"
                >
                  <Icon size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>}
          </div>
        )}
      </div>

      {/* Footer: Preferences + Collapse */}
      <div className="shrink-0 border-t border-sidebar-border">
        <button
          onClick={() => setPrefsOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <Settings size={12} />
          Preferences
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-1 text-muted-foreground hover:text-foreground text-xs gap-1"
        >
          <ChevronLeft size={12} />
          Collapse
        </button>
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-sidebar border border-border rounded-r p-1 text-muted-foreground hover:text-foreground z-10"
        >
          <ChevronRight size={14} />
        </button>
      )}

      <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}
