"use client";
import { useEffect, useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AccountNode, AnalysisResult } from "@/types/aml";
import { neighborhood } from "@/lib/analysis";

type GraphNodeData = { label: string; role: string; score: number; risk: string };
type GraphProps = { result: AnalysisResult | null; selectedId: string | null; depth: number; onSelect: (id: string) => void; focusId: string | null };
const color = (risk: string): string => risk === "high" ? "#ef4444" : risk === "medium" ? "#f59e0b" : "#22c55e";
const roleName = (role: AccountNode["role"]): string => ({ source: "Источник", receiver: "Получатель", transit: "Транзит", collector: "Сборщик", distributor: "Распределитель", hub: "Хаб", suspicious_intermediary: "Подозрительный посредник", unknown: "Не определена" })[role];

function GraphCanvas({ result, selectedId, depth, onSelect, focusId }: GraphProps) {
  const { fitView, setCenter } = useReactFlow();
  const view = useMemo(() => { if (!result) return null; return focusId ? neighborhood(result, focusId, depth) : { nodes: new Set(result.accounts.map((account) => account.id)), edges: result.edges }; }, [result, focusId, depth]);
  const nodes = useMemo<Node<GraphNodeData>[]>(() => { if (!result || !view) return []; const visible = result.accounts.filter((account) => view.nodes.has(account.id)); return visible.map((account, index) => { const angle = (index / Math.max(visible.length, 1)) * Math.PI * 2; const radius = 230 + (index % 3) * 75; return { id: account.id, position: { x: Math.cos(angle) * radius + 420, y: Math.sin(angle) * radius + 260 }, data: { label: `${account.label}\n${roleName(account.role)} · ${account.riskScore}`, role: roleName(account.role), score: account.riskScore, risk: account.riskLevel }, style: { background: "#101621", color: "#e5edf7", border: `1px solid ${color(account.riskLevel)}`, borderRadius: 12, padding: 12, width: 155, boxShadow: selectedId === account.id ? `0 0 0 2px ${color(account.riskLevel)}` : "none", fontSize: 12, whiteSpace: "pre-line" }, title: `${account.label} · ${roleName(account.role)} · риск ${account.riskScore}` }; }); }, [result, view, selectedId]);
  const edges = useMemo<Edge[]>(() => (view?.edges ?? []).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: `${Math.round(edge.amount / 1000)}k ₸`, animated: false, style: { stroke: "#60728b", strokeWidth: 1.4 }, markerEnd: { type: "arrowclosed" as const, color: "#91a4bd" } })), [view]);
  useEffect(() => { if (focusId) { const target = nodes.find((node) => node.id === focusId); if (target) void setCenter(target.position.x + 70, target.position.y + 40, { zoom: 1.1, duration: 350 }); } else void fitView({ padding: 0.2, duration: 300 }); }, [focusId, nodes, setCenter, fitView]);
  if (!result || !nodes.length) return <div className="empty-card">Загрузите данные, чтобы построить карту движения денег.</div>;
  return <div className="graph-wrap"><ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={(_, node) => onSelect(node.id)} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background color="#233044" gap={24} /><Controls /><MiniMap nodeColor={(node) => { const data = node.data; const risk = typeof data === "object" && data !== null && "risk" in data && typeof data.risk === "string" ? data.risk : "low"; return color(risk); }} /></ReactFlow></div>;
}
export default function MoneyFlowGraph(props: GraphProps) { return <ReactFlowProvider><GraphCanvas {...props} /></ReactFlowProvider>; }
