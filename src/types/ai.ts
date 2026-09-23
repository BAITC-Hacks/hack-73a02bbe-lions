import type { AccountRole, RiskLevel } from "@/types/aml";

export interface AiNodeProfile {
  nodeId: string;
  assignedRole: AccountRole;
  riskScore: number;
  riskLevel: RiskLevel;
  inflow: number;
  outflow: number;
  inCount: number;
  outCount: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  riskFactors: string[];
  relatedPathSummary: string[];
}

export interface AiAnalysisResult {
  riskLevel: RiskLevel;
  roleExplanation: string;
  riskSummary: string;
  keySignals: string[];
  recommendedChecks: string[];
  disclaimer: string;
}
