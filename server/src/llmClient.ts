import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ModelConfigInfo, ModelConfigUpdate } from "../../src/shared/types.js";
import { recordAgentTrace } from "./agentTraceStore.js";
import { serverDataDir } from "./paths.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type JsonSchemaDefinition = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
};

class LlmRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

function isRetryable(error: unknown) {
  if (error instanceof LlmRequestError) {
    return Boolean(error.status && [408, 429, 500, 502, 503, 504].includes(error.status));
  }

  const message = String(error);
  return /timeout|timed out|network|fetch failed|abort|socket/i.test(message);
}

type StoredModelConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

const configFile = path.join(serverDataDir, "model-config.json");

async function readStoredModelConfig(): Promise<StoredModelConfig> {
  try {
    const raw = await fs.readFile(configFile, "utf-8");
    return JSON.parse(raw) as StoredModelConfig;
  } catch {
    return {};
  }
}

async function writeStoredModelConfig(config: StoredModelConfig) {
  await fs.mkdir(serverDataDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf-8");
}

async function getRuntimeConfig() {
  const stored = await readStoredModelConfig();

  return {
    apiKey: stored.apiKey ?? process.env.OPENAI_API_KEY ?? "",
    baseUrl: (stored.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: stored.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    source: (stored.apiKey || stored.baseUrl || stored.model ? "local_file" : "env") as "local_file" | "env"
  };
}

function providerHintFor(baseUrl: string) {
  return /deepseek/i.test(baseUrl)
    ? "DeepSeek"
    : /dashscope|qwen|aliyun/i.test(baseUrl)
      ? "Qwen / DashScope"
      : /openai/i.test(baseUrl)
        ? "OpenAI-compatible"
        : "Custom OpenAI-compatible";
}

export async function hasLlmConfig() {
  const { apiKey } = await getRuntimeConfig();
  return Boolean(apiKey);
}

function maskApiKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 10) return "已配置";
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

export async function getLlmRuntimeInfo(): Promise<ModelConfigInfo> {
  const config = await getRuntimeConfig();

  return {
    configured: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    providerHint: providerHintFor(config.baseUrl),
    apiKeyMasked: maskApiKey(config.apiKey),
    source: config.source,
    envKeys: ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"]
  };
}

export async function updateLlmRuntimeConfig(input: ModelConfigUpdate): Promise<ModelConfigInfo> {
  const current = await getRuntimeConfig();
  const next: StoredModelConfig = {
    apiKey: input.apiKey?.trim() || current.apiKey,
    baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
    model: input.model.trim()
  };

  await writeStoredModelConfig(next);
  return getLlmRuntimeInfo();
}

async function executeChatCompletion(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  responseFormat: Record<string, unknown>;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0.2,
        response_format: input.responseFormat
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LlmRequestError(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    throw new LlmRequestError(payload.error?.message ?? `LLM request failed with ${response.status}`, response.status);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlmRequestError("LLM response did not include message content");
  }

  return content;
}

async function requestChatCompletion(input: {
  messages: ChatMessage[];
  responseFormat: Record<string, unknown>;
}) {
  const { apiKey, baseUrl, model } = await getRuntimeConfig();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const content = await executeChatCompletion({ apiKey, baseUrl, model, messages: input.messages, responseFormat: input.responseFormat });
      return { content, model, retryCount: attempt };
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        throw error;
      }
      const delayMs = attempt === 0 ? 2000 : 5000;
      console.warn(`LLM request failed (attempt ${attempt + 1}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error("LLM request failed");
}

export async function createJsonChatCompletion(messages: ChatMessage[]) {
  const result = await requestChatCompletion({
    messages,
    responseFormat: { type: "json_object" }
  });
  return result.content;
}

export async function createStructuredChatCompletion(
  messages: ChatMessage[],
  schema: JsonSchemaDefinition,
  context: { traceId?: string; agentName?: string; schemaVersion?: string } = {}
) {
  const startedAt = Date.now();
  const traceId = context.traceId ?? nanoid(12);
  let model = "unknown";
  let retryCount = 0;

  try {
    let result;
    try {
      result = await requestChatCompletion({
        messages,
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: schema.name,
            strict: schema.strict ?? true,
            schema: schema.schema
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unsupported = /response_format|json_schema|schema|unsupported|invalid/i.test(message);
      if (!unsupported) throw error;

      result = await requestChatCompletion({
        messages: [
          {
            role: "system",
            content: [
              "当前模型服务不支持 strict JSON Schema response_format。",
              "你必须严格按照下面 JSON Schema 输出一个 JSON object，不要 Markdown，不要解释。",
              JSON.stringify({ name: schema.name, schema: schema.schema }, null, 2)
            ].join("\n")
          },
          ...messages
        ],
        responseFormat: { type: "json_object" }
      });
    }

    model = result.model;
    retryCount = result.retryCount;
    await recordAgentTrace({
      traceId,
      agentName: context.agentName ?? schema.name,
      schemaVersion: context.schemaVersion ?? "v1",
      model,
      durationMs: Date.now() - startedAt,
      retryCount,
      status: "success"
    }).catch((error) => console.warn("Failed to persist agent trace", error));
    return result.content;
  } catch (error) {
    if (model === "unknown") {
      model = (await getRuntimeConfig()).model;
    }
    await recordAgentTrace({
      traceId,
      agentName: context.agentName ?? schema.name,
      schemaVersion: context.schemaVersion ?? "v1",
      model,
      durationMs: Date.now() - startedAt,
      retryCount,
      status: "failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error)
    }).catch((traceError) => console.warn("Failed to persist agent trace", traceError));
    throw error;
  }
}

export function extractJsonObject(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced?.[1] ?? raw;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found in LLM response");
  }

  return JSON.parse(text.slice(first, last + 1)) as unknown;
}
