import { promises as fs } from "node:fs";
import { nanoid } from "nanoid";
import type { InterviewPracticeRecord, InterviewSession, MemoryProfile } from "../../src/shared/types.js";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  unwrapPayload
} from "./agentValidation.js";
import { ragRerankAgentSchema } from "./agentSchemas.js";
import { executeStructuredAgent } from "./agentExecutor.js";
import { getDatabase, readJsonColumn, writeDatabase } from "./database.js";
import { defaultExperienceLibraryFile } from "./paths.js";
import { rankDocumentsByKeywords } from "./ragRetrieval.js";

export type RagDocumentKind = "interview_experience" | "training_memory";

export type RagDocument = {
  id: string;
  kind: RagDocumentKind;
  sourceId?: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RagHit = {
  id: string;
  kind: RagDocumentKind;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  relevance: number;
  reason: string;
  source: string;
  excerpt: string;
  matchedTerms: string[];
};

let libraryMigrationPromise: Promise<void> | undefined;

function splitExperienceEntries(raw: string) {
  return raw
    .split(/\n(?=公司[:：])/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 30);
}

function extractMeta(content: string, key: string) {
  const matched = content.match(new RegExp(`^${key}[:：]\\s*(.+)$`, "m"));
  return matched?.[1]?.trim();
}

function buildExperienceDocument(content: string): RagDocument {
  const company = extractMeta(content, "公司") ?? "未注明公司";
  const role = extractMeta(content, "岗位") ?? "未注明岗位";
  const round = extractMeta(content, "轮次") ?? "未注明轮次";
  const time = extractMeta(content, "时间") ?? "未注明时间";
  const source = extractMeta(content, "来源") ?? "手动导入";
  const direction = extractMeta(content, "方向") ?? "未注明方向";
  const now = new Date().toISOString();

  return {
    id: `seed-${company}-${role}-${round}-${time}`.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 120),
    kind: "interview_experience",
    sourceId: defaultExperienceLibraryFile,
    title: `${company} · ${role} · ${round}`,
    content,
    metadata: {
      company,
      role,
      round,
      time,
      source,
      direction
    },
    createdAt: now,
    updatedAt: now
  };
}

async function seedExperienceLibrary() {
  const db = await getDatabase();
  const existing = db.exec("SELECT COUNT(*) AS count FROM rag_documents WHERE kind = 'interview_experience'");
  const count = Number(existing[0]?.values[0]?.[0] ?? 0);
  if (count > 0) return;

  try {
    const raw = await fs.readFile(defaultExperienceLibraryFile, "utf-8");
    const documents = splitExperienceEntries(raw).map(buildExperienceDocument);
    if (documents.length === 0) return;
    await upsertRagDocuments(documents);
  } catch {
    return;
  }
}

export async function ensureRagSeeded() {
  libraryMigrationPromise ??= seedExperienceLibrary();
  await libraryMigrationPromise;
}

export async function upsertRagDocuments(documents: RagDocument[]) {
  if (documents.length === 0) return;

  await writeDatabase((db) => {
    const statement = db.prepare(
      `INSERT OR REPLACE INTO rag_documents
        (id, kind, source_id, title, content, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    try {
      for (const document of documents) {
        statement.run([
          document.id,
          document.kind,
          document.sourceId ?? "",
          document.title,
          document.content,
          JSON.stringify(document.metadata),
          document.createdAt,
          document.updatedAt
        ]);
      }
    } finally {
      statement.free();
    }
  });
}

export async function listRagDocuments(kind?: RagDocumentKind): Promise<RagDocument[]> {
  await ensureRagSeeded();
  const db = await getDatabase();
  const rows = db.exec(
    kind
      ? "SELECT id, kind, source_id, title, content, metadata, created_at, updated_at FROM rag_documents WHERE kind = ? ORDER BY datetime(updated_at) DESC"
      : "SELECT id, kind, source_id, title, content, metadata, created_at, updated_at FROM rag_documents ORDER BY datetime(updated_at) DESC",
    kind ? [kind] : []
  )[0];

  if (!rows) return [];

  return rows.values.map((value: unknown[]) => ({
    id: String(value[0]),
    kind: value[1] as RagDocumentKind,
    sourceId: String(value[2] || ""),
    title: String(value[3]),
    content: String(value[4]),
    metadata: JSON.parse(String(value[5] || "{}")) as Record<string, unknown>,
    createdAt: String(value[6]),
    updatedAt: String(value[7])
  }));
}

export async function getRagStats() {
  await ensureRagSeeded();
  const db = await getDatabase();
  const rows = db.exec("SELECT kind, COUNT(*) AS count FROM rag_documents GROUP BY kind")[0];
  const byKind: Record<string, number> = {};

  for (const value of rows?.values ?? []) {
    byKind[String(value[0])] = Number(value[1]);
  }

  return {
    total: Object.values(byKind).reduce((sum, count) => sum + count, 0),
    byKind
  };
}

function trainingRecordToDocument(session: InterviewSession, record: InterviewPracticeRecord): RagDocument {
  const now = new Date().toISOString();
  const content = [
    `公司：${session.company}`,
    `岗位：${session.jobTitle}`,
    `问题：${record.question.question}`,
    `回答：${record.answer}`,
    `评分：${record.evaluation.score}`,
    `薄弱点：${record.evaluation.weaknesses.join("；")}`,
    `建议：${record.evaluation.nextPractice.join("；")}`,
    `标签：${record.question.tags.join("、")}`
  ].join("\n");

  return {
    id: `memory-${session.id}-${record.id}`,
    kind: "training_memory",
    sourceId: session.id,
    title: `${session.company} · ${session.jobTitle} · ${record.question.question.slice(0, 28)}`,
    content,
    metadata: {
      sessionId: session.id,
      question: record.question.question,
      score: record.evaluation.score,
      tags: record.question.tags,
      createdAt: record.createdAt
    },
    createdAt: record.createdAt,
    updatedAt: now
  };
}

export async function upsertTrainingMemoryDocument(session: InterviewSession, record: InterviewPracticeRecord) {
  await upsertRagDocuments([trainingRecordToDocument(session, record)]);
}

function buildRagQuery(session: InterviewSession, memory?: MemoryProfile) {
  return [
    `目标公司：${session.company}`,
    `目标岗位：${session.jobTitle}`,
    `岗位域：${session.jobDomains.join("、")}`,
    `JD：${session.jdText.slice(0, 1200)}`,
    `简历：${session.resumeText.slice(0, 1200)}`,
    `岗位关键词：${session.profileAnalysis?.jobKeywords.map((item) => item.name).join("、") ?? ""}`,
    `简历短板：${session.profileAnalysis?.gaps.map((item) => item.name).join("、") ?? ""}`,
    `薄弱记忆：${memory?.weakTags.join("、") ?? ""}`
  ].join("\n");
}

function buildRerankPrompt(input: {
  query: string;
  documents: RagDocument[];
  kinds: RagDocumentKind[];
  topK: number;
}) {
  return JSON.stringify(
    {
      task: "从候选 RAG 文档中选择对当前面试准备最有帮助的材料。",
      rules: [
        "只基于候选文档选择，不要编造不存在的材料。",
        "公司完全匹配优先；没有目标公司材料时，参考同岗位、同技术栈、同业务场景、同候选人阶段。",
        "面经材料优先用于判断真实高频问题和追问风格。",
        "训练记忆优先用于判断候选人历史薄弱点和下一轮训练重点。",
        "返回 topK 个以内，relevance 取 0-100。"
      ],
      outputSchema: {
        hits: [{ id: "string", relevance: "number 0-100", reason: "string" }]
      },
      topK: input.topK,
      query: input.query,
      candidates: input.documents.map((document) => ({
        id: document.id,
        kind: document.kind,
        title: document.title,
        metadata: document.metadata,
        content: document.content.slice(0, 1800)
      }))
    },
    null,
    2
  );
}

function normalizeRerankResult(value: unknown) {
  const payload = unwrapPayload(value, ["result", "data"], "ragRerankResponse");
  return asArray(payload.hits, "ragRerankResponse.hits")
    .map((item) => {
      const hit = asRecord(item, "ragRerankResponse.hits[]");
      return {
        id: asString(hit.id, "ragRerankResponse.hits[].id"),
        relevance: asNumber(hit.relevance, "ragRerankResponse.hits[].relevance", 0, 100),
        reason: asString(hit.reason, "ragRerankResponse.hits[].reason")
      };
    })
    .slice(0, 12);
}

export async function retrieveRagContext(input: {
  session: InterviewSession;
  memory?: MemoryProfile;
  kinds?: RagDocumentKind[];
  topK?: number;
}): Promise<RagHit[]> {
  await ensureRagSeeded();
  const kinds = input.kinds ?? ["interview_experience", "training_memory"];
  const topK = input.topK ?? 8;
  const allDocuments = await listRagDocuments();
  const filteredDocuments = allDocuments.filter((document) => kinds.includes(document.kind));
  const keywordRanked = rankDocumentsByKeywords({
    documents: filteredDocuments,
    query: buildRagQuery(input.session, input.memory),
    company: input.session.company,
    jobTitle: input.session.jobTitle,
    limit: 24
  });
  const candidates = keywordRanked.map((item) => item.document);

  if (candidates.length === 0) return [];

  const ranked = await executeStructuredAgent({
    agentName: "rag_reranker",
    schema: ragRerankAgentSchema,
    messages: [
    {
      role: "system",
      content:
        "你是 RAG Retriever / Reranker。你只负责从候选文档中选择相关材料并解释原因，不能生成新面经。输出 JSON object。"
    },
    {
      role: "user",
      content: buildRerankPrompt({
        query: buildRagQuery(input.session, input.memory),
        documents: candidates,
        kinds,
        topK
      })
    }
    ],
    normalize: normalizeRerankResult
  });
  const byId = new Map(candidates.map((document) => [document.id, document]));
  const keywordById = new Map(keywordRanked.map((item) => [item.document.id, item]));

  return ranked
    .map((item) => {
      const document = byId.get(item.id);
      if (!document) return undefined;
      const keywordMatch = keywordById.get(document.id);
      return {
        id: document.id,
        kind: document.kind,
        title: document.title,
        content: document.content,
        metadata: document.metadata,
        relevance: item.relevance,
        reason: item.reason,
        source: String(document.metadata.source ?? document.sourceId ?? "本地资料"),
        excerpt: document.content.slice(0, 240),
        matchedTerms: keywordMatch?.matchedTerms ?? []
      };
    })
    .filter((item): item is RagHit => Boolean(item))
    .slice(0, topK);
}

export function summarizeRagHits(hits: RagHit[]) {
  return hits.map((hit) => ({
    id: hit.id,
    kind: hit.kind,
    title: hit.title,
    relevance: hit.relevance,
    reason: hit.reason,
    source: hit.source,
    excerpt: hit.excerpt,
    matchedTerms: hit.matchedTerms,
    metadata: hit.metadata,
    content: hit.content.slice(0, 1800)
  }));
}
