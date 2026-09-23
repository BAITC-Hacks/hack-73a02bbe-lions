"use client";
import { useEffect, useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AccountNode, AnalysisResult } from "@/types/aml";
import { neighborhood } from "@/lib/analysis";

type GraphNodeData = { label: string; role: string; score: number; risk: string };
type GraphProps = { result: AnalysisResult | null; selectedId: string | null; depth: number; onSelect: (id: string) => void; focusId: string | null; focusMode: boolean };
const color = (risk: string): string => risk === "high" ? "#d97878" : risk === "medium" ? "#d2a85e" : "#6db5a8";
const roleName = (role: AccountNode["role"]): string => ({ source: "Источник", receiver: "Получатель", transit: "Транзит", collector: "Сборщик", distributor: "Распределитель", hub: "Хаб", suspicious_intermediary: "Подозрительный посредник", unknown: "Не определена" })[role];

function layoutNodes(accounts: AccountNode[], edges: AnalysisResult["edges"], root: string | null): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const levels = new Map<string, number>();
  if (root) {
    const queue = [root];
    levels.set(root, 0);
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      for (const edge of edges) {
        const neighbor = edge.source === current ? edge.target : edge.target === current ? edge.source : null;
        if (neighbor && !levels.has(neighbor)) { levels.set(neighbor, (levels.get(current) ?? 0) + 1); queue.push(neighbor); }
      }
    }
  }
  const groups = new Map<number, AccountNode[]>();
  const columns = Math.max(1, Math.ceil(Math.sqrt(accounts.length)));
  for (const [index, account] of accounts.entries()) {
    const level = root ? (levels.get(account.id) ?? 1) : Math.floor(index / columns);
    const group = groups.get(level) ?? [];
    group.push(account);
    groups.set(level, group);
  }
  for (const [level, group] of groups) {
    const sorted = [...group].sort((a, b) => b.riskScore - a.riskScore || a.id.localeCompare(b.id));
    const rowOffset = ((Math.max(0, 7 - sorted.length)) * 58) / 2;
    sorted.forEach((account, index) => { positions.set(account.id, { x: 100 + level * 275, y: 90 + rowOffset + index * 116 }); });
  }
  return positions;
}

function GraphCanvas({ result, selectedId, depth, onSelect, focusId, focusMode }: GraphProps) {
  const { fitView, setCenter } = useReactFlow();
  const view = useMemo(() => { if (!result) return null; return focusMode && focusId ? neighborhood(result, focusId, depth) : { nodes: new Set(result.accounts.map((account) => account.id)), edges: result.edges }; }, [result, focusId, focusMode, depth]);
  const nodes = useMemo<Node<GraphNodeData>[]>(() => { if (!result || !view) return []; const visible = result.accounts.filter((account) => view.nodes.has(account.id)); const positions = layoutNodes(visible, view.edges, focusMode ? focusId : null); return visible.map((account) => { const selected = selectedId === account.id; const riskFill = account.riskLevel === "high" ? "#281d23" : account.riskLevel === "medium" ? "#282319" : "#14211f"; return { id: account.id, position: positions.get(account.id) ?? { x: 100, y: 90 }, data: { label: `${account.label}\n${roleName(account.role)} · ${account.riskScore}`, role: roleName(account.role), score: account.riskScore, risk: account.riskLevel }, style: { background: riskFill, color: "#e5edf7", border: `1px solid ${selected ? "#65d8c7" : "#344457"}`, borderRadius: 7, padding: 10, width: 172, boxShadow: selected ? "0 0 0 2px #65d8c755" : "0 4px 14px #00000033", fontSize: 11, lineHeight: 1.35, whiteSpace: "pre-line" }, title: `${account.label} · ${roleName(account.role)} · риск ${account.riskScore}` }; }); }, [result, view, selectedId, focusId, focusMode]);
  const edges = useMemo<Edge[]>(() => { const visibleEdges = view?.edges ?? []; const maxAmount = Math.max(...visibleEdges.map((edge) => edge.amount), 1); return visibleEdges.map((edge) => { const relevant = focusMode || edge.source === selectedId || edge.target === selectedId; return { id: edge.id, source: edge.source, target: edge.target, type: "smoothstep", label: relevant ? `${Math.round(edge.amount / 1000)}k ₸` : undefined, labelStyle: { fill: "#b8c6d7", fontSize: 9, fontWeight: 500 }, labelBgStyle: { fill: "#0d141f", fillOpacity: 0.92 }, labelBgPadding: [4, 2] as [number, number], animated: false, style: { stroke: relevant ? "#71869f" : "#4b5d72", strokeWidth: 1 + 3 * Math.sqrt(edge.amount / maxAmount), opacity: relevant ? 0.9 : 0.34 }, markerEnd: { type: "arrowclosed" as const, color: relevant ? "#9fb2c7" : "#596b80" } }; }); }, [view, selectedId, focusMode]);
  useEffect(() => { if (focusMode && focusId) { const target = nodes.find((node) => node.id === focusId); if (target) void setCenter(target.position.x + 70, target.position.y + 40, { zoom: 1.1, duration: 350 }); } else if (nodes.length) void fitView({ padding: 0.2, duration: 350 }); }, [focusId, focusMode, nodes, setCenter, fitView]);
  if (!result || !nodes.length) return <div className="empty-card">Загрузите данные, чтобы построить карту движения денег.</div>;
  return <div className="graph-wrap"><ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={(_, node) => onSelect(node.id)} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background color="#233044" gap={24} /><Controls /><MiniMap style={{ background: "#101621", border: "1px solid #334155", borderRadius: 8 }} nodeColor={(node) => { const data = node.data; const risk = typeof data === "object" && data !== null && "risk" in data && typeof data.risk === "string" ? data.risk : "low"; return color(risk); }} /></ReactFlow></div>;
}
export default function MoneyFlowGraph(props: GraphProps) { return <ReactFlowProvider><GraphCanvas {...props} /></ReactFlowProvider>; }
