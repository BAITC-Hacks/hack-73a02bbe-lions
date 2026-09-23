import { z } from "zod";

const aiAnalysisFields = {
  riskLevel: z.enum(["low", "medium", "high"]),
  roleExplanation: z.string().min(1).max(1200),
  riskSummary: z.string().min(1).max(1600),
  keySignals: z.array(z.string().min(1).max(400)).min(3).max(5),
  recommendedChecks: z.array(z.string().min(1).max(500)).length(3),
};

export const aiModelResponseSchema = z.object({
  ...aiAnalysisFields,
  disclaimer: z.string().min(1).max(200),
}).strict();

export const aiAnalysisSchema = aiModelResponseSchema.extend({
  disclaimer: z.literal("Результат является вспомогательной аналитикой и требует проверки AML-специалистом"),
}).strict();

export const aiProfileSchema = z.object({
  nodeId: z.string().min(1).max(100),
  assignedRole: z.enum(["source", "receiver", "transit", "collector", "distributor", "hub", "suspicious_intermediary", "unknown"]),
  riskScore: z.number().finite().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high"]),
  inflow: z.number().finite().nonnegative(),
  outflow: z.number().finite().nonnegative(),
  inCount: z.number().int().nonnegative(),
  outCount: z.number().int().nonnegative(),
  uniqueSenders: z.number().int().nonnegative(),
  uniqueReceivers: z.number().int().nonnegative(),
  riskFactors: z.array(z.string().min(1).max(400)).max(12),
  relatedPathSummary: z.array(z.string().min(1).max(500)).max(32),
}).strict();

export const aiRequestSchema = z.object({ profile: aiProfileSchema }).strict();
