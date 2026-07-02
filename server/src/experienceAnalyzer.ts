import type { ExperienceAnalysis, ExperienceQuestion } from "../../src/shared/types.js";
import {
  asArray,
  asEnum,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  difficultyValues,
  jobDomainValues,
  levelValues,
  questionTypeValues
} from "./agentValidation.js";
import { experienceAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

type ExperienceAnalyzerInput = {
  company: string;
  jobTitle: string;
  experienceText: string;
  jdText?: string;
  resumeText?: string;
};

const systemPrompt = [
  "你是 InterviewAgent 的 Experience Analyzer Agent。",
  "你的输入是用户搜集来的面经材料，不是让你生成面经题库。",
  "只允许从用户提供的 experienceText 中抽取、归并、结构化问题；材料没有出现的问题不要凭空添加。",
  "如果 experienceText 为空或没有可识别面试问题，返回 questions: []，hotTags: []，summary.questionCount: 0。",
  "可以结合 JD 和岗位方向给问题打标签、判断领域、判断难度，但不能把标签判断扩展成新题。",
  "技术岗位的问题类型可以包含能力方法、经历验证、场景实战、协作沟通、压力追问；八股、手写题只在原文出现或技术岗位强相关原文出现时保留。",
  "非技术岗位不要把问题误标成八股或手写代码。",
  "反问如果原文出现，可以作为 reverse_question；否则不要生成反问。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(input: ExperienceAnalyzerInput) {
  return JSON.stringify(
    {
      outputSchema: {
        questions: [
          {
            question: "string，从 experienceText 抽取或轻微清洗后的原问题",
            type: questionTypeValues,
            domainTags: jobDomainValues,
            tags: ["string"],
            difficulty: difficultyValues,
            frequency: "number，重复或同类问题出现次数，至少 1",
            source: "string，例如：用户搜集面经"
          }
        ],
        companyStyle: {
          projectDepth: levelValues,
          basicKnowledge: levelValues,
          pressureLevel: levelValues,
          commonPatterns: ["string，只总结材料中体现出的模式"]
        },
        hotTags: [{ name: "string", count: "number" }],
        summary: {
          questionCount: "number",
          hardestTags: ["string"],
          recommendedFocus: ["string"]
        }
      },
      input: {
        company: input.company,
        jobTitle: input.jobTitle,
        jdText: input.jdText?.slice(0, 1800) ?? "",
        resumeText: input.resumeText?.slice(0, 1200) ?? "",
        experienceText: input.experienceText.slice(0, 8000)
      }
    },
    null,
    2
  );
}

function normalizeQuestion(value: unknown): ExperienceQuestion {
  const record = asRecord(value, "experience.questions[]");

  return {
    question: asString(record.question, "experience.questions[].question"),
    type: asEnum(record.type, questionTypeValues, "experience.questions[].type"),
    domainTags: asStringArray(record.domainTags, "experience.questions[].domainTags", 6).map((domain) =>
      asEnum(domain, jobDomainValues, "experience.questions[].domainTags[]")
    ),
    tags: asStringArray(record.tags, "experience.questions[].tags", 8),
    difficulty: asEnum(record.difficulty, difficultyValues, "experience.questions[].difficulty"),
    frequency: Math.max(1, asNumber(record.frequency, "experience.questions[].frequency", 1, 99)),
    source: asString(record.source, "experience.questions[].source")
  };
}

function normalizeExperienceAnalysis(value: unknown): ExperienceAnalysis {
  const record = asRecord(value, "experienceAnalysis");
  const companyStyle = asRecord(record.companyStyle, "experienceAnalysis.companyStyle");
  const summary = asRecord(record.summary, "experienceAnalysis.summary");
  const questions = asArray(record.questions, "experienceAnalysis.questions").map(normalizeQuestion).slice(0, 40);
  const hotTags = asArray(record.hotTags, "experienceAnalysis.hotTags")
    .map((item) => {
      const tag = asRecord(item, "experienceAnalysis.hotTags[]");
      return {
        name: asString(tag.name, "experienceAnalysis.hotTags[].name"),
        count: asNumber(tag.count, "experienceAnalysis.hotTags[].count", 0, 999)
      };
    })
    .slice(0, 16);

  return {
    questions,
    companyStyle: {
      projectDepth: asEnum(companyStyle.projectDepth, levelValues, "experienceAnalysis.companyStyle.projectDepth"),
      basicKnowledge: asEnum(companyStyle.basicKnowledge, levelValues, "experienceAnalysis.companyStyle.basicKnowledge"),
      pressureLevel: asEnum(companyStyle.pressureLevel, levelValues, "experienceAnalysis.companyStyle.pressureLevel"),
      commonPatterns: asStringArray(companyStyle.commonPatterns, "experienceAnalysis.companyStyle.commonPatterns", 8)
    },
    hotTags,
    summary: {
      questionCount: asNumber(summary.questionCount, "experienceAnalysis.summary.questionCount", 0, 999),
      hardestTags: asStringArray(summary.hardestTags, "experienceAnalysis.summary.hardestTags", 8),
      recommendedFocus: asStringArray(summary.recommendedFocus, "experienceAnalysis.summary.recommendedFocus", 8)
    }
  };
}

export async function analyzeExperience(input: ExperienceAnalyzerInput): Promise<ExperienceAnalysis> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    experienceAgentSchema
  );

  return normalizeExperienceAnalysis(extractJsonObject(raw));
}
