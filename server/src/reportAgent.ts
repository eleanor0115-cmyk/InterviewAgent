import type { EvaluationResult, InterviewReport, InterviewSession, MemoryProfile } from "../../src/shared/types.js";
import { asArray, asNumber, asRecord, asString, asStringArray, unwrapPayload } from "./agentValidation.js";
import { reportAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

const dimensionLabels: Record<keyof EvaluationResult["dimensionScores"], string> = {
  relevance: "扣题",
  depth: "深度",
  structure: "结构",
  evidence: "证据",
  reflection: "复盘"
};

const systemPrompt = [
  "你是 InterviewAgent 的 Report Agent，负责生成候选人的面试训练复盘报告。",
  "报告必须基于 session 中的岗位画像、面经分析、准备方案、训练题和真实练习记录；不要使用本地规则拼总结。",
  "如果练习记录很少，要明确说明可信度有限，但仍可基于已有材料给下一步训练建议。",
  "总分和维度分由你根据材料综合判断，不要简单平均。",
  "高风险问题必须来自 initialQuestions 或 practiceRecords，不要编造不存在的问题。",
  "表达主线只能基于候选人已有简历/回答线索，不要编造量化结果，不强制压缩到 30 秒。",
  "markdown 字段要是一份完整中文复盘报告。",
  "输出必须是 JSON object，不要 Markdown 包裹，不要额外解释。"
].join("\n");

function slimSession(session: InterviewSession) {
  return {
    id: session.id,
    company: session.company,
    jobTitle: session.jobTitle,
    jobDomains: session.jobDomains,
    jdText: session.jdText.slice(0, 2200),
    resumeText: session.resumeText.slice(0, 2200),
    profileAnalysis: session.profileAnalysis,
    experienceAnalysis: session.experienceAnalysis,
    interviewPlan: session.interviewPlan,
    initialQuestions: session.initialQuestions?.slice(0, 10),
    practiceRecords: session.practiceRecords?.slice(0, 12)
  };
}

function buildUserPrompt(session: InterviewSession, memory?: MemoryProfile) {
  return JSON.stringify(
    {
      outputSchema: {
        overallScore: "number 0-100",
        dimensionScores: {
          relevance: "number 0-100",
          depth: "number 0-100",
          structure: "number 0-100",
          evidence: "number 0-100",
          reflection: "number 0-100"
        },
        summary: "string",
        strengths: ["string"],
        weaknesses: ["string"],
        riskyQuestions: [{ question: "string", score: "number 0-100", reason: "string" }],
        nextPlan: ["string"],
        thirtySecondRewrite: "string，候选人可直接用于自我介绍或项目表达的表达主线",
        markdown: "string"
      },
      session: slimSession(session),
      memory
    },
    null,
    2
  );
}

function normalizeReport(value: unknown, sessionId: string): InterviewReport {
  const payload = unwrapPayload(value, ["report", "result", "data"], "reportResponse");
  const dimensionScores = asRecord(payload.dimensionScores, "reportResponse.dimensionScores");
  const scores: EvaluationResult["dimensionScores"] = {
    relevance: asNumber(dimensionScores.relevance, "reportResponse.dimensionScores.relevance", 0, 100),
    depth: asNumber(dimensionScores.depth, "reportResponse.dimensionScores.depth", 0, 100),
    structure: asNumber(dimensionScores.structure, "reportResponse.dimensionScores.structure", 0, 100),
    evidence: asNumber(dimensionScores.evidence, "reportResponse.dimensionScores.evidence", 0, 100),
    reflection: asNumber(dimensionScores.reflection, "reportResponse.dimensionScores.reflection", 0, 100)
  };

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    overallScore: asNumber(payload.overallScore, "reportResponse.overallScore", 0, 100),
    dimensionScores: scores,
    radarData: Object.entries(dimensionLabels).map(([key, name]) => ({
      name,
      value: scores[key as keyof EvaluationResult["dimensionScores"]]
    })),
    summary: asString(payload.summary, "reportResponse.summary"),
    strengths: asStringArray(payload.strengths, "reportResponse.strengths", 8),
    weaknesses: asStringArray(payload.weaknesses, "reportResponse.weaknesses", 8),
    riskyQuestions: asArray(payload.riskyQuestions, "reportResponse.riskyQuestions")
      .map((item) => {
        const question = asRecord(item, "reportResponse.riskyQuestions[]");
        return {
          question: asString(question.question, "reportResponse.riskyQuestions[].question"),
          score: asNumber(question.score, "reportResponse.riskyQuestions[].score", 0, 100),
          reason: asString(question.reason, "reportResponse.riskyQuestions[].reason")
        };
      })
      .slice(0, 6),
    nextPlan: asStringArray(payload.nextPlan, "reportResponse.nextPlan", 8),
    thirtySecondRewrite: asString(payload.thirtySecondRewrite, "reportResponse.thirtySecondRewrite"),
    markdown: asString(payload.markdown, "reportResponse.markdown")
  };
}

export async function createReport(session: InterviewSession, memory?: MemoryProfile): Promise<InterviewReport> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(session, memory) }
    ],
    reportAgentSchema
  );

  return normalizeReport(extractJsonObject(raw), session.id);
}
