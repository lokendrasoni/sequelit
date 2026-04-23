import { useTabStore } from "@/stores/tabStore";
import { QueryTab } from "@/features/editor/QueryTab";
import { DataBrowser } from "@/features/data/DataBrowser";
import { ErdDiagram } from "@/features/erd/ErdDiagram";
import { SchemaDiffView } from "@/features/schema/SchemaDiffView";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { ActivityMonitor } from "@/features/dashboard/ActivityMonitor";
import { RoleManager } from "@/features/roles/RoleManager";
import { PgConfigEditor } from "@/features/config/PgConfigEditor";
import { TerminalTab } from "@/features/terminal/TerminalTab";
import { JobScheduler } from "@/features/jobs/JobScheduler";
import { AiAssistant } from "@/features/ai/AiAssistant";
import { WorkspaceManager } from "@/features/workspace/WorkspaceManager";
import { PgManagement } from "@/features/pgmanagement/PgManagement";

export function TabContent() {
  const { tabs, activeTabId } = useTabStore();

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground select-none">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No tab open</p>
          <p className="text-sm">Connect to a database and open a query tab</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={tab.id === activeTabId ? "h-full flex flex-col" : "hidden"}
        >
          {tab.type === "query" && <QueryTab tab={tab} />}
          {tab.type === "data" && <DataBrowser tab={tab} />}
          {tab.type === "erd" && <ErdDiagram tab={tab} />}
          {tab.type === "schema-diff" && <SchemaDiffView tab={tab} />}
          {tab.type === "dashboard" && <Dashboard tab={tab} />}
          {tab.type === "activity" && <ActivityMonitor tab={tab} />}
          {tab.type === "roles" && <RoleManager tab={tab} />}
          {tab.type === "pg-config" && <PgConfigEditor tab={tab} />}
          {tab.type === "terminal" && <TerminalTab tab={tab} />}
          {tab.type === "jobs" && <JobScheduler />}
          {tab.type === "ai" && <AiAssistant tab={tab} />}
          {tab.type === "workspace" && <WorkspaceManager tab={tab} />}
          {tab.type === "pg-management" && <PgManagement tab={tab} />}
        </div>
      ))}
    </div>
  );
}
