import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelConfigInfo, ModelConfigUpdate } from "../../src/shared/types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
const configFile = path.join(dataDir, "model-config.json");

async function readStoredModelConfig(): Promise<StoredModelConfig> {
  try {
    const raw = await fs.readFile(configFile, "utf-8");
    return JSON.parse(raw) as StoredModelConfig;
  } catch {
    return {};
  }
}

async function writeStoredModelConfig(config: StoredModelConfig) {
  await fs.mkdir(dataDir, { recursive: true });
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

export async function createJsonChatCompletion(messages: ChatMessage[]) {
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
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" }
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
