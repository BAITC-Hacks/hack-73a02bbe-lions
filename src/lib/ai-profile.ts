import type { AnalysisResult } from "@/types/aml";
import type { AiNodeProfile } from "@/types/ai";
import { neighborhood } from "@/lib/analysis";

export function buildAiProfile(result: AnalysisResult, nodeId: string): AiNodeProfile | null {
  const account = result.accounts.find((candidate) => candidate.id === nodeId);
  if (!account) return null;
  const view = neighborhood(result, nodeId, 4);
  const adjacency = new Map<string, Array<{ target: string; amount: number }>>();
  for (const edge of view.edges) {
    const sourceEdges = adjacency.get(edge.source) ?? [];
    sourceEdges.push({ target: edge.target, amount: edge.amount });
    adjacency.set(edge.source, sourceEdges);
    const targetEdges = adjacency.get(edge.target) ?? [];
    targetEdges.push({ target: edge.source, amount: edge.amount });
    adjacency.set(edge.target, targetEdges);
  }
  const paths: string[] = [];
  const queue: Array<{ node: string; path: string[]; depth: number }> = [{ node: nodeId, path: [nodeId], depth: 0 }];
  while (queue.length && paths.length < 32) {
    const current = queue.shift();
    if (!current || current.depth >= 4) continue;
    for (const neighbor of adjacency.get(current.node) ?? []) {
      if (current.path.includes(neighbor.target)) continue;
      const nextPath = [...current.path, neighbor.target];
      paths.push(`${nextPath.join(" → ")} · агрегированный объём ${Math.round(neighbor.amount)} ₸ · уровень ${current.depth + 1}`);
      queue.push({ node: neighbor.target, path: nextPath, depth: current.depth + 1 });
      if (paths.length >= 32) break;
    }
  }
  return { nodeId: account.id, assignedRole: account.role, riskScore: account.riskScore, riskLevel: account.riskLevel, inflow: account.inflow, outflow: account.outflow, inCount: account.inCount, outCount: account.outCount, uniqueSenders: account.uniqueSenders, uniqueReceivers: account.uniqueReceivers, riskFactors: account.riskFactors, relatedPathSummary: paths };
}
