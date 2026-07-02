import type { FollowUpResult, InterviewQuestion, QuestionType } from "../../src/shared/types.js";
import { asArray, asNumber, asRecord, asString, unwrapPayload } from "./agentValidation.js";
import { followUpAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

type FollowUpInput = Pick<InterviewQuestion, "question" | "expectedPoints" | "tags"> & {
  answer: string;
  type?: QuestionType;
  depth?: number;
};

const systemPrompt = [
  "你是 InterviewAgent 的 Follow-up Agent，负责根据候选人的回答生成真实面试追问。",
  "追问必须基于当前问题、候选人回答、预期要点和标签，不要用固定模板。",
  "优先追问回答中的模糊点、断言缺少证据处、个人贡献不清处、技术/方案权衡不足处、结果验证不足处。",
  "如果是 AI 开放题，要追问真实使用过程、人的判断边界、约束机制、幻觉/隐私/不可验证内容处理、个人差异化优势。",
  "追问不要替候选人回答，不要输出训练说明。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(input: FollowUpInput) {
  return JSON.stringify(
    {
      outputSchema: {
        followUps: [{ question: "string", reason: "string", focus: "string" }],
        summary: "string"
      },
      constraints: {
        followUpCount: input.depth ?? 2,
        maxFollowUpCount: 3,
        language: "中文，像真实面试官追问"
      },
      input
    },
    null,
    2
  );
}

function normalizeFollowUpResult(value: unknown, requestedDepth?: number): FollowUpResult {
  const payload = unwrapPayload(value, ["result", "data"], "followUpResponse");
  const depth = asNumber(requestedDepth ?? 2, "followUp.depth", 1, 3);
  const followUps = asArray(payload.followUps, "followUpResponse.followUps")
    .map((item) => {
      const followUp = asRecord(item, "followUpResponse.followUps[]");
      return {
        question: asString(followUp.question, "followUpResponse.followUps[].question"),
        reason: asString(followUp.reason, "followUpResponse.followUps[].reason"),
        focus: asString(followUp.focus, "followUpResponse.followUps[].focus")
      };
    })
    .slice(0, depth);

  if (followUps.length === 0) {
    throw new Error("Follow-up 模型响应缺少追问");
  }

  return {
    followUps,
    summary: asString(payload.summary, "followUpResponse.summary")
  };
}

export async function generateFollowUps(input: FollowUpInput): Promise<FollowUpResult> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    followUpAgentSchema
  );

  return normalizeFollowUpResult(extractJsonObject(raw), input.depth);
}
