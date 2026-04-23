import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface SessionInfo {
  connected: boolean;
  seconds_remaining?: number;
  expired?: boolean;
}

interface SessionStore {
  sessions: Record<string, SessionInfo>;
  warningShown: Set<string>;
  poll: (connectionId: string) => Promise<void>;
  touch: (connectionId: string) => Promise<void>;
  clearSession: (connectionId: string) => void;
  isExpired: (connectionId: string) => boolean;
  isWarning: (connectionId: string) => boolean;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},
  warningShown: new Set(),

  poll: async (connectionId) => {
    try {
      const info = await invoke<SessionInfo>("get_session_info", { id: connectionId });
      set((s) => ({
        sessions: { ...s.sessions, [connectionId]: info },
      }));
    } catch {
      // ignore
    }
  },

  touch: async (connectionId) => {
    try {
      await invoke("touch_session", { id: connectionId });
      set((s) => ({
        sessions: {
          ...s.sessions,
          [connectionId]: {
            ...s.sessions[connectionId],
            seconds_remaining: 3600,
            expired: false,
          },
        },
        warningShown: new Set([...s.warningShown].filter((id) => id !== connectionId)),
      }));
    } catch {
      // ignore
    }
  },

  clearSession: (connectionId) =>
    set((s) => {
      const next = { ...s.sessions };
      delete next[connectionId];
      return { sessions: next };
    }),

  isExpired: (connectionId) => get().sessions[connectionId]?.expired ?? false,

  isWarning: (connectionId) => {
    const remaining = get().sessions[connectionId]?.seconds_remaining ?? 3600;
    return remaining <= 300 && remaining > 0;
  },
}));
