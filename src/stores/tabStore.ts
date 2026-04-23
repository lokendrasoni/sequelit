import { create } from "zustand";

export type TabType = "query" | "data" | "schema" | "dashboard" | "erd" | "schema-diff" | "activity" | "roles" | "pg-config" | "terminal" | "jobs" | "ai" | "workspace" | "pg-management";

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  connectionId: string;
  schema?: string;
  table?: string;
  isDirty?: boolean;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Omit<Tab, "id">) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  closeTabsByConnection: (connectionId: string) => void;
}

let tabCounter = 0;

export const useTabStore = create<TabStore>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab) => {
    const id = `tab-${++tabCounter}`;
    const newTab: Tab = { ...tab, id };
    set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
    return id;
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null;
      }
      return { tabs: next, activeTabId: nextActive };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  closeTabsByConnection: (connectionId) =>
    set((s) => {
      const next = s.tabs.filter((t) => t.connectionId !== connectionId);
      const activeStillExists = next.some((t) => t.id === s.activeTabId);
      return {
        tabs: next,
        activeTabId: activeStillExists ? s.activeTabId : (next[next.length - 1]?.id ?? null),
      };
    }),
}));
