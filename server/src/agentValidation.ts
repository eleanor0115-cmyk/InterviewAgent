export const questionTypeValues = [
  "business_understanding",
  "experience_validation",
  "method_ability",
  "scenario_practice",
  "collaboration",
  "pressure_challenge",
  "reverse_question"
] as const;

export const jobDomainValues = [
  "frontend",
  "backend",
  "ai_engineering",
  "product",
  "operations",
  "data_analysis",
  "marketing",
  "business",
  "general"
] as const;

export const difficultyValues = ["easy", "medium", "hard"] as const;
export const levelValues = ["low", "medium", "high"] as const;
export const memoryLevelValues = ["weak", "medium", "strong"] as const;
type MemoryLevel = (typeof memoryLevelValues)[number];

export function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} 不是合法的 JSON 对象`);
  }

  return value as Record<string, unknown>;
}

export function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} 不是合法数组`);
  }

  return value;
}

export function asString(value: unknown, context: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} 不是合法字符串`);
  }

  return value.trim();
}

export function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function asStringArray(value: unknown, context: string, max = 12) {
  const items = asArray(value, context)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return items.slice(0, max);
}

export function asNumber(value: unknown, context: string, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${context} 不是合法数字`);
  }

  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

export function asFloat(value: unknown, context: string, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${context} 不是合法数字`);
  }

  return Math.max(min, Math.min(max, numberValue));
}

export function asEnum<T extends readonly string[]>(value: unknown, allowed: T, context: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${context} 必须是 ${allowed.join(" | ")} 之一`);
  }

  return value as T[number];
}

export function asMemoryLevel(value: unknown, context: string): MemoryLevel {
  if (typeof value !== "string") {
    throw new Error(`${context} must be one of ${memoryLevelValues.join(" | ")}`);
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases: Record<string, MemoryLevel> = {
    weak: "weak",
    low: "weak",
    lower: "weak",
    minor: "weak",
    mild: "weak",
    slight: "weak",
    small: "weak",
    medium: "medium",
    middle: "medium",
    moderate: "medium",
    normal: "medium",
    neutral: "medium",
    strong: "strong",
    high: "strong",
    higher: "strong",
    major: "strong",
    severe: "strong",
    critical: "strong",
    important: "strong"
  };

  const memoryLevel = aliases[normalized];
  if (!memoryLevel) {
    throw new Error(`${context} must be one of ${memoryLevelValues.join(" | ")}`);
  }

  return memoryLevel;
}

export function unwrapPayload(value: unknown, wrapperKeys: string[], context: string) {
  const record = asRecord(value, context);

  for (const key of wrapperKeys) {
    if (record[key]) return asRecord(record[key], `${context}.${key}`);
  }

  return record;
}
