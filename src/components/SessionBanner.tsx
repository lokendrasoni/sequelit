import { useSessionStore } from "@/stores/sessionStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function SessionBanner() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const connect = useConnectionStore((s) => s.connect);
  const { sessions, touch, isWarning, isExpired } = useSessionStore();

  if (!activeConnectionId) return null;

  const session = sessions[activeConnectionId];
  const warning = isWarning(activeConnectionId);
  const expired = isExpired(activeConnectionId);

  if (!session || (!warning && !expired)) return null;

  const mins = Math.ceil((session.seconds_remaining ?? 0) / 60);

  if (expired) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/30 text-xs text-destructive shrink-0">
        <AlertTriangle size={12} />
        <span>Session expired.</span>
        <button
          onClick={() => connect(activeConnectionId)}
          className="flex items-center gap-1 underline hover:no-underline font-medium"
        >
          <RefreshCw size={11} /> Reconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30 text-xs text-yellow-600 dark:text-yellow-400 shrink-0">
      <AlertTriangle size={11} />
      <span>Session expires in {mins} minute{mins !== 1 ? "s" : ""}.</span>
      <button
        onClick={() => touch(activeConnectionId)}
        className="underline hover:no-underline font-medium"
      >
        Extend
      </button>
    </div>
  );
}
