import type { InterviewSession, KnowledgeTree } from "../../src/shared/types.js";
import { asArray, asRecord, asString, asStringArray, unwrapPayload } from "./agentValidation.js";
import { knowledgeTreeAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

const systemPrompt = [
  "你是 InterviewAgent 的 Knowledge Tree Agent，负责把本次面试准备材料生成知识图谱。",
  "图谱必须基于 JD、简历、搜集面经、准备方案和训练记录，不要用固定节点模板。",
  "节点要体现真实准备逻辑：岗位要求、面经高频、简历证据、风险短板、训练重点、AI 开放题或项目深挖等。",
  "mermaid 必须是可渲染的 graph TD 源码，节点 id 使用字母数字下划线，节点文案放在双引号里。",
  "nodes 和 edges 要与 mermaid 对应，方便前端渲染和说明。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(session: InterviewSession) {
  return JSON.stringify(
    {
      outputSchema: {
        mermaid: "graph TD\\n  ROOT[\"...\"]\\n  ROOT --> A",
        nodes: [{ id: "string", label: "string", level: "number", tags: ["string"] }],
        edges: [{ from: "string", to: "string", reason: "string" }]
      },
      constraints: {
        maxNodes: 18,
        maxEdges: 24,
        rootShouldRepresent: `${session.company} ${session.jobTitle}`
      },
      session: {
        company: session.company,
        jobTitle: session.jobTitle,
        jobDomains: session.jobDomains,
        profileAnalysis: session.profileAnalysis,
        experienceAnalysis: session.experienceAnalysis,
        interviewPlan: session.interviewPlan,
        initialQuestions: session.initialQuestions?.slice(0, 10),
        practiceRecords: session.practiceRecords?.slice(0, 8)
      }
    },
    null,
    2
  );
}

function normalizeTree(value: unknown): KnowledgeTree {
  const payload = unwrapPayload(value, ["tree", "result", "data"], "knowledgeTreeResponse");
  const nodes = asArray(payload.nodes, "knowledgeTreeResponse.nodes")
    .map((item) => {
      const node = asRecord(item, "knowledgeTreeResponse.nodes[]");
      return {
        id: asString(node.id, "knowledgeTreeResponse.nodes[].id"),
        label: asString(node.label, "knowledgeTreeResponse.nodes[].label"),
        level: typeof node.level === "number" ? node.level : Number(node.level ?? 0),
        tags: asStringArray(node.tags, "knowledgeTreeResponse.nodes[].tags", 6)
      };
    })
    .slice(0, 24);
  const edges = asArray(payload.edges, "knowledgeTreeResponse.edges")
    .map((item) => {
      const edge = asRecord(item, "knowledgeTreeResponse.edges[]");
      return {
        from: asString(edge.from, "knowledgeTreeResponse.edges[].from"),
        to: asString(edge.to, "knowledgeTreeResponse.edges[].to"),
        reason: asString(edge.reason, "knowledgeTreeResponse.edges[].reason")
      };
    })
    .slice(0, 32);

  if (!asString(payload.mermaid, "knowledgeTreeResponse.mermaid").startsWith("graph TD")) {
    throw new Error("Knowledge Tree 模型响应不是 graph TD Mermaid 源码");
  }

  return {
    mermaid: asString(payload.mermaid, "knowledgeTreeResponse.mermaid"),
    nodes,
    edges
  };
}

export async function createKnowledgeTree(session: InterviewSession): Promise<KnowledgeTree> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(session) }
    ],
    knowledgeTreeAgentSchema
  );

  return normalizeTree(extractJsonObject(raw));
}
