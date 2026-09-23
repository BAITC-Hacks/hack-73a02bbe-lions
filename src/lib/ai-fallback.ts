import type { AccountNode } from "@/types/aml";
import type { AiAnalysisResult } from "@/types/ai";

const roleExplanation: Record<AccountNode["role"], string> = { source: "Счёт преимущественно отправляет средства и почти не получает их.", receiver: "Счёт преимущественно получает средства и ограниченно переводит их дальше.", transit: "Счёт получает средства и переводит значительную часть дальше за короткий интервал.", collector: "Счёт получает средства от нескольких уникальных отправителей.", distributor: "Счёт отправляет средства нескольким уникальным получателям.", hub: "Счёт имеет высокую связность и значительный оборот относительно графа.", suspicious_intermediary: "Счёт совмещает несколько наблюдаемых риск-сигналов и требует приоритетной ручной проверки.", unknown: "Данных недостаточно для уверенного определения роли счёта." };

export function createFallbackAnalysis(account: AccountNode): AiAnalysisResult {
  return { riskLevel: account.riskLevel, roleExplanation: roleExplanation[account.role], riskSummary: `Локальный анализ оценивает узел как ${account.riskScore} из 100. Это приоритизация проверки, а не вывод о нарушении.`, keySignals: account.riskFactors, recommendedChecks: ["Проверить экономический смысл входящих и исходящих операций.", "Сопоставить операции с внутренними AML/KYC-данными и документами.", "Проверить связанные маршруты и временную последовательность переводов."], disclaimer: "Результат является вспомогательной аналитикой и требует проверки AML-специалистом" };
}
