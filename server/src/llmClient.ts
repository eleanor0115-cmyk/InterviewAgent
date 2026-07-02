import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModelConfigInfo, ModelConfigUpdate } from "../../src/shared/types.js";
import { serverDataDir } from "./paths.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type JsonSchemaDefinition = {
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

async function requestChatCompletion(input: {
  messages: ChatMessage[];
  responseFormat: Record<string, unknown>;
}) {
  const { apiKey, baseUrl, model } = await getRuntimeConfig();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      temperature: 0.2,
      response_format: input.responseFormat
    })
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `LLM request failed with ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response did not include message content");
  }

  return content;
}

export async function createJsonChatCompletion(messages: ChatMessage[]) {
  return requestChatCompletion({
    messages,
    responseFormat: { type: "json_object" }
  });
}

export async function createStructuredChatCompletion(messages: ChatMessage[], schema: JsonSchemaDefinition) {
  try {
    return await requestChatCompletion({
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

    if (!unsupported) {
      throw error;
    }

    return createJsonChatCompletion([
      {
        role: "system",
        content: [
          "当前模型服务不支持 strict JSON Schema response_format。",
          "你必须严格按照下面 JSON Schema 输出一个 JSON object，不要 Markdown，不要解释。",
          JSON.stringify({ name: schema.name, schema: schema.schema }, null, 2)
        ].join("\n")
      },
      ...messages
    ]);
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
