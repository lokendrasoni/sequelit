import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TabContent } from "./TabContent";
import { SessionBanner } from "./SessionBanner";
import { useThemeStore, applyTheme } from "@/stores/themeStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSessionWatcher } from "@/hooks/useSession";

export function Layout() {
  const { theme } = useThemeStore();
  const loadConnections = useConnectionStore((s) => s.loadConnections);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useSessionWatcher();

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <SessionBanner />
        <TabBar />
        <TabContent />
      </div>
    </div>
  );
}
