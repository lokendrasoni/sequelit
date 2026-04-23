import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface SavedConnection {
  id: string;
  name: string;
  db_type: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  ssl_mode?: string;
  ssh_host?: string;
  ssh_user?: string;
  ssh_port?: number;
  ssh_key_path?: string;
  color_tag?: string;
  group_name?: string;
  read_only: boolean;
  last_used?: string;
  created_at: string;
}

export interface ConnectionConfig {
  id?: string;
  name: string;
  db_type: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl_mode?: string;
  ssh_host?: string;
  ssh_user?: string;
  ssh_port?: number;
  ssh_key_path?: string;
  color_tag?: string;
  group_name?: string;
  read_only?: boolean;
}

interface ConnectionStore {
  connections: SavedConnection[];
  activeConnectionId: string | null;
  connectedIds: string[]; // array — stable for useEffect deps
  loading: boolean;
  error: string | null;

  loadConnections: () => Promise<void>;
  saveConnection: (config: ConnectionConfig) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (config: ConnectionConfig) => Promise<string>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  isConnected: (id: string) => boolean;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  connectedIds: [],
  loading: false,
  error: null,

  loadConnections: async () => {
    set({ loading: true, error: null });
    try {
      const connections = await invoke<SavedConnection[]>("get_connections");
      set({ connections, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  saveConnection: async (config) => {
    const id = await invoke<string>("save_connection", { config });
    await get().loadConnections();
    return id;
  },

  deleteConnection: async (id) => {
    await invoke("delete_connection", { id });
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      connectedIds: s.connectedIds.filter((i) => i !== id),
      activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
    }));
  },

  testConnection: async (config) => {
    return invoke<string>("test_connection", { config });
  },

  connect: async (id) => {
    await invoke("connect", { id });
    set((s) => ({
      connectedIds: s.connectedIds.includes(id) ? s.connectedIds : [...s.connectedIds, id],
    }));
  },

  disconnect: async (id) => {
    await invoke("disconnect", { id });
    set((s) => ({ connectedIds: s.connectedIds.filter((i) => i !== id) }));
  },

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  isConnected: (id) => get().connectedIds.includes(id),
}));
