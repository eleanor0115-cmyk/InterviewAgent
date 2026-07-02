import { z } from "zod";
import type { JobDomain, QuestionType } from "../../src/shared/types.js";

const questionTypeSchema = z.enum([
  "business_understanding",
  "experience_validation",
  "method_ability",
  "scenario_practice",
  "collaboration",
  "pressure_challenge",
  "reverse_question"
]);

const jobDomainSchema = z.enum([
  "frontend",
  "backend",
  "ai_engineering",
  "product",
  "operations",
  "data_analysis",
  "marketing",
  "business",
  "general"
]);

export const createSessionSchema = z.object({
  company: z.string().trim().min(1, "请输入公司名称"),
  jobTitle: z.string().trim().min(1, "请输入岗位名称"),
  jdText: z.string().trim().min(20, "JD 至少需要 20 个字符"),
  resumeText: z.string().trim().min(20, "简历至少需要 20 个字符"),
  experienceText: z.string().trim().optional().default(""),
  questionTypes: z.array(questionTypeSchema).optional(),
  jobDomains: z.array(jobDomainSchema).optional(),
  interviewTypes: z.array(z.string()).optional()
}).transform((input) => {
  const { interviewTypes: _legacyInterviewTypes, ...rest } = input;

  return {
    ...rest,
    questionTypes: input.questionTypes ?? ([] as QuestionType[]),
    jobDomains: input.jobDomains && input.jobDomains.length > 0 ? input.jobDomains : (["general"] as JobDomain[])
  };
});

export const profileAnalyzeSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  company: z.string().trim().min(1),
  jobTitle: z.string().trim().min(1),
  jdText: z.string().trim().min(20),
  resumeText: z.string().trim().min(20)
});

export const experienceAnalyzeSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  company: z.string().trim().min(1),
  jobTitle: z.string().trim().min(1),
  experienceText: z.string().trim().optional().default(""),
  jdText: z.string().trim().optional().default(""),
  resumeText: z.string().trim().optional().default("")
});

export const plannerSchema = z.object({
  sessionId: z.string().trim().min(1)
});

export const followUpSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1, "请输入你的回答"),
  expectedPoints: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  type: questionTypeSchema.optional(),
  depth: z.number().min(1).max(3).optional()
});

export const evaluationSchema = followUpSchema.omit({ depth: true });

const difficultySchema = z.enum(["easy", "medium", "hard"]);

const experienceQuestionSchema = z.object({
  question: z.string().trim().min(1),
  type: questionTypeSchema,
  domainTags: z.array(jobDomainSchema).default(["general"]),
  tags: z.array(z.string().trim().min(1)).default([]),
  difficulty: difficultySchema,
  frequency: z.number().min(1).default(1),
  source: z.string().trim().min(1).default("手动编辑")
});

const interviewQuestionSchema = z.object({
  question: z.string().trim().min(1),
  type: questionTypeSchema,
  domainTags: z.array(jobDomainSchema).default(["general"]),
  tags: z.array(z.string().trim().min(1)).default([]),
  difficulty: difficultySchema,
  expectedPoints: z.array(z.string()).default([]),
  sourceReason: z.string().default("")
});

const followUpQuestionSchema = z.object({
  question: z.string().trim().min(1),
  reason: z.string().default(""),
  focus: z.string().default("")
});

const evaluationResultSchema = z.object({
  score: z.number().min(0).max(100),
  dimensionScores: z.object({
    relevance: z.number().min(0).max(100),
    depth: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    evidence: z.number().min(0).max(100),
    reflection: z.number().min(0).max(100)
  }),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  missingPoints: z.array(z.string()).default([]),
  suggestedAnswer: z.array(z.string()).default([]),
  nextPractice: z.array(z.string()).default([]),
  memoryUpdates: z
    .array(
      z.object({
        tag: z.string(),
        level: z.enum(["weak", "medium", "strong"]),
        reason: z.string()
      })
    )
    .default([])
});

export const practiceRecordSchema = z.object({
  sessionId: z.string().trim().min(1),
  question: interviewQuestionSchema,
  answer: z.string().trim().min(1),
  followUps: z.array(followUpQuestionSchema).default([]),
  evaluation: evaluationResultSchema
});

export const reportSchema = z.object({
  sessionId: z.string().trim().min(1)
});

export const expressionOptimizeSchema = z.object({
  answer: z.string().trim().min(1, "请输入需要优化的回答"),
  question: z.string().trim().optional().default(""),
  expectedPoints: z.array(z.string()).default([])
});

export const knowledgeTreeSchema = z.object({
  sessionId: z.string().trim().min(1)
});

export const modelConfigUpdateSchema = z.object({
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url("请输入合法的 Base URL"),
  model: z.string().trim().min(1, "请输入模型名称")
});

export const reflectionSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  followUps: z.array(followUpQuestionSchema).default([]),
  evaluation: evaluationResultSchema.optional(),
  expectedPoints: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([])
});

export const experienceQuestionUpdateSchema = z.object({
  sessionId: z.string().trim().min(1),
  questions: z.array(experienceQuestionSchema)
});

const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const profileAnalysisSchema = z.object({
  jobKeywords: z.array(
    z.object({
      name: z.string().min(1),
      weight: z.number().min(0).max(1),
      reason: z.string().min(1),
      evidence: z.array(z.string()).default([])
    })
  ),
  resumeStrengths: z.array(
    z.object({
      title: z.string().min(1),
      evidence: z.array(z.string()).default([]),
      matchedKeywords: z.array(z.string()).default([])
    })
  ),
  gaps: z.array(
    z.object({
      name: z.string().min(1),
      risk: riskLevelSchema,
      suggestion: z.string().min(1),
      missingFromResume: z.boolean(),
      jdEvidence: z.array(z.string()).default([])
    })
  ),
  summary: z.object({
    matchScore: z.number().min(0).max(100),
    roleDirection: z.string().min(1),
    senioritySignal: z.string().min(1),
    preparationPriority: z.array(z.string()).default([])
  })
});
