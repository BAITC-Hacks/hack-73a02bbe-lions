export const roles = ["source", "receiver", "transit", "collector", "distributor", "hub", "suspicious_intermediary", "unknown"] as const;
export type AccountRole = (typeof roles)[number];
export type RiskLevel = "low" | "medium" | "high";
export interface Transaction { id: string; timestamp: string; sender: string; receiver: string; amount: number; currency: string; comment: string; }
export interface AccountNode { id: string; label: string; inflow: number; outflow: number; totalVolume: number; inCount: number; outCount: number; uniqueSenders: number; uniqueReceivers: number; role: AccountRole; riskScore: number; riskLevel: RiskLevel; riskFactors: string[]; }
export interface MoneyFlowEdge { id: string; source: string; target: string; amount: number; timestamp: string; transactionIds: string[]; }
export interface RiskAssessment { score: number; level: RiskLevel; factors: string[]; }
export interface AnalysisResult { transactions: Transaction[]; accounts: AccountNode[]; edges: MoneyFlowEdge[]; suspiciousAccounts: AccountNode[]; totalVolume: number; }
