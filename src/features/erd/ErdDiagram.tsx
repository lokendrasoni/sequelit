import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { Tab } from "@/stores/tabStore";
import { RefreshCw, LayoutGrid } from "lucide-react";

interface TableInfo {
  schema: string;
  name: string;
  table_type: string;
}

interface ColumnDetail {
  name: string;
  type_name: string;
  nullable: boolean;
  is_primary_key: boolean;
}

interface FkRelationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  constraint_name: string;
}

interface TableNode {
  name: string;
  columns: ColumnDetail[];
}

const NODE_WIDTH = 200;
const NODE_HEIGHT_BASE = 40;
const COL_HEIGHT = 20;

function TableNodeComponent({ data }: { data: { name: string; columns: ColumnDetail[] } }) {
  return (
    <div className="bg-background border border-primary/60 rounded shadow-lg overflow-hidden min-w-[160px]">
      <div className="bg-primary/15 px-3 py-1.5 font-mono text-xs font-semibold text-primary border-b border-primary/30">
        {data.name}
      </div>
      <div className="divide-y divide-border/50">
        {data.columns.map((col) => (
          <div key={col.name} className="flex items-center gap-2 px-3 py-0.5">
            {col.is_primary_key && (
              <span className="text-[9px] text-yellow-500 font-bold shrink-0">PK</span>
            )}
            <span className="text-[10px] font-mono text-foreground truncate flex-1">{col.name}</span>
            <span className="text-[9px] text-muted-foreground/60 shrink-0">{col.type_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { table: TableNodeComponent };

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    const cols = (node.data as { columns: ColumnDetail[] }).columns.length;
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT_BASE + cols * COL_HEIGHT,
    });
  });
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - (NODE_HEIGHT_BASE + (node.data as { columns: ColumnDetail[] }).columns.length * COL_HEIGHT) / 2,
      },
    };
  });
}

interface Props {
  tab: Tab;
}

export function ErdDiagram({ tab }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadErd = useCallback(async () => {
    if (!tab.connectionId || !tab.schema) return;
    setLoading(true);
    setError("");
    try {
      const [tables, fks] = await Promise.all([
        invoke<TableInfo[]>("get_tables", { connectionId: tab.connectionId, schema: tab.schema }),
        invoke<FkRelationship[]>("get_fk_relationships", { connectionId: tab.connectionId, schema: tab.schema }),
      ]);

      const tableNodes: TableNode[] = await Promise.all(
        tables.filter((t) => !t.table_type.includes("VIEW")).map(async (t) => {
          try {
            const detail = await invoke<{ columns: ColumnDetail[] }>("get_table_detail", {
              connectionId: tab.connectionId,
              schema: tab.schema,
              table: t.name,
            });
            return { name: t.name, columns: detail.columns };
          } catch {
            return { name: t.name, columns: [] };
          }
        })
      );

      const rawNodes: Node[] = tableNodes.map((t) => ({
        id: t.name,
        type: "table",
        data: { name: t.name, columns: t.columns },
        position: { x: 0, y: 0 },
      }));

      const rawEdges: Edge[] = fks.map((fk) => ({
        id: fk.constraint_name,
        source: fk.from_table,
        target: fk.to_table,
        label: `${fk.from_column} → ${fk.to_column}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "hsl(var(--primary))", strokeOpacity: 0.6 },
        labelStyle: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
        animated: false,
      }));

      const laidOut = applyDagreLayout(rawNodes, rawEdges);
      setNodes(laidOut);
      setEdges(rawEdges);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab.connectionId, tab.schema, setNodes, setEdges]);

  useEffect(() => { loadErd(); }, [loadErd]);

  const reLayout = () => {
    setNodes((nds) => applyDagreLayout(nds, edges));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        <RefreshCw size={14} className="animate-spin mr-2" /> Loading ERD…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-destructive p-4 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-30" />
        <Controls />
        <Panel position="top-right" className="flex gap-2">
          <button
            onClick={reLayout}
            className="flex items-center gap-1 text-xs bg-background border border-border px-2 py-1 rounded shadow hover:bg-accent"
          >
            <LayoutGrid size={12} />
            Auto Layout
          </button>
          <button
            onClick={loadErd}
            className="flex items-center gap-1 text-xs bg-background border border-border px-2 py-1 rounded shadow hover:bg-accent"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
