import { useEffect } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useTabStore } from "@/stores/tabStore";

const POLL_INTERVAL_MS = 30_000; // poll every 30s

export function useSessionWatcher() {
  const { connectedIds, disconnect, setActiveConnection } = useConnectionStore();
  const { closeTabsByConnection } = useTabStore();
  const { poll, isExpired } = useSessionStore();

  useEffect(() => {
    if (connectedIds.length === 0) return;
    const ids = [...connectedIds];

    const interval = setInterval(async () => {
      for (const id of ids) {
        await poll(id);
        if (isExpired(id)) {
          await disconnect(id);
          closeTabsByConnection(id);
          setActiveConnection(null);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connectedIds, poll, isExpired, disconnect, closeTabsByConnection, setActiveConnection]);
}
