import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { aiAnalysisSchema, aiModelResponseSchema, aiRequestSchema } from "@/lib/ai-schema";

export const runtime = "nodejs";

const DISCLAIMER = "Результат является вспомогательной аналитикой и требует проверки AML-специалистом";
const instructions = `Ты — AML-ассистент Cifron AI. Верни только JSON, предусмотренный схемой, без Markdown, заголовков, списков или дополнительных полей. Пиши кратко и строго по-русски, используй только факты из переданного обезличенного профиля и не повторяй исходные данные. riskLevel обязан в точности совпадать с переданным локальным riskLevel. roleExplanation — одно короткое предложение. riskSummary — максимум два коротких предложения. keySignals — от 3 до 5 коротких строк только о переданных riskFactors или метриках. recommendedChecks — ровно 3 короткие строки для ручной AML-проверки. disclaimer обязан быть ровно: «${DISCLAIMER}». Не выдумывай суммы, транзакции, людей, документы, IP, устройства или связи; не утверждай преступление, мошенничество или отмывание денег; не давай советы по обходу AML/KYC.`;

function errorResponse(message: string, status: number, code?: string): NextResponse { return NextResponse.json(code ? { error: message, code } : { error: message }, { status }); }
function logMetadata(metadata: { httpStatus: number | null; errorCode: string | null; errorParam?: string | null; responseStatus?: string | null; incompleteReason?: string | null; responseId?: string | null; inputTokens?: number | null; outputTokens?: number | null; reasoningTokens?: number | null; hasOutputParsed: boolean; resultFields: string[] }): void { console.info("[ai-analysis] metadata", metadata); }

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Некорректное тело запроса.", 400); }
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Профиль выбранного узла не прошёл проверку.", 400);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse("AI-анализ недоступен: на сервере не настроен OPENAI_API_KEY.", 503);
  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await client.responses.parse({ model: "gpt-5-mini", store: false, instructions, input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(parsed.data) }] }], text: { format: zodTextFormat(aiModelResponseSchema, "aml_node_analysis") }, max_output_tokens: 4000 }, { signal: controller.signal });
    const outputFields = response.output_parsed && typeof response.output_parsed === "object" ? Object.keys(response.output_parsed) : [];
    const incompleteReason = response.incomplete_details?.reason ?? null;
    logMetadata({ httpStatus: 200, errorCode: null, responseStatus: response.status, incompleteReason, responseId: response.id ?? null, inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null, reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null, hasOutputParsed: Boolean(response.output_parsed), resultFields: outputFields });
    if (response.status === "incomplete") {
      if (incompleteReason === "max_output_tokens") return errorResponse("AI-анализ не завершён. Попробуйте повторить анализ.", 502, "AI_RESPONSE_INCOMPLETE");
      if (incompleteReason === "content_filter") return errorResponse("AI-анализ не может быть показан для этого запроса.", 502, "AI_RESPONSE_FILTERED");
      return errorResponse("AI-анализ не завершён. Попробуйте повторить анализ.", 502, "AI_RESPONSE_INCOMPLETE");
    }
    if (!response.output_parsed) return errorResponse("AI вернул неполный или неподдерживаемый результат.", 502);
    const result = aiAnalysisSchema.safeParse(response.output_parsed);
    if (!result.success || result.data.riskLevel !== parsed.data.profile.riskLevel) return errorResponse("AI вернул результат, который не согласуется с детерминированной оценкой узла.", 502);
    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof APIError) {
      logMetadata({ httpStatus: error.status ?? null, errorCode: typeof error.code === "string" ? error.code : "openai_api_error", errorParam: typeof error.param === "string" ? error.param : null, incompleteReason: null, responseId: null, inputTokens: null, outputTokens: null, reasoningTokens: null, hasOutputParsed: false, resultFields: [] });
      if (error.status === 400) return errorResponse("AI не принял профиль узла. Попробуйте повторить анализ.", 502);
      if (error.status === 401) return errorResponse("AI-анализ недоступен: проверьте серверный API-ключ.", 503);
      if (error.status === 429) return errorResponse("AI временно перегружен. Попробуйте повторить анализ позже.", 429);
      if (typeof error.status === "number" && error.status >= 500) return errorResponse("Сервис AI временно недоступен.", 503);
      return errorResponse("Не удалось получить AI-анализ.", 502);
    }
    if (error instanceof APIUserAbortError || error instanceof APIConnectionTimeoutError || (error instanceof Error && error.name === "AbortError")) { logMetadata({ httpStatus: null, errorCode: "timeout", incompleteReason: null, responseId: null, inputTokens: null, outputTokens: null, reasoningTokens: null, hasOutputParsed: false, resultFields: [] }); return errorResponse("AI-анализ превысил лимит времени в 20 секунд.", 504); }
    if (error instanceof APIConnectionError) { logMetadata({ httpStatus: null, errorCode: "network_error", incompleteReason: null, responseId: null, inputTokens: null, outputTokens: null, reasoningTokens: null, hasOutputParsed: false, resultFields: [] }); return errorResponse("Не удалось соединиться с сервисом AI.", 502); }
    logMetadata({ httpStatus: null, errorCode: error instanceof Error ? error.name : "unknown_error", incompleteReason: null, responseId: null, inputTokens: null, outputTokens: null, reasoningTokens: null, hasOutputParsed: false, resultFields: [] });
    return errorResponse("Не удалось соединиться с сервисом AI.", 502);
  } finally { clearTimeout(timeout); }
}
