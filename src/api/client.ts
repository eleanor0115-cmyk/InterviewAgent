import type {
  CreateSessionInput,
  EvaluationResult,
  ExpressionOptimization,
  ExperienceAnalysis,
  ExperienceQuestion,
  FollowUpResult,
  InterviewPlan,
  InterviewPracticeRecord,
  InterviewQuestion,
  InterviewReport,
  InterviewSession,
  KnowledgeTree,
  MemoryProfile,
  ModelConfigInfo,
  ModelConfigUpdate,
  ParsedResume,
  ProfileAnalysis,
  ReflectionResult
} from "../shared/types";

type ProfileAgentResponse = {
  analysis: ProfileAnalysis;
  source: "llm";
  warning?: string;
};

type ExperienceAgentResponse = {
  analysis: ExperienceAnalysis;
  source: "llm";
  warning?: string;
};

type PlannerResponse = {
  plan: InterviewPlan;
  questions: InterviewQuestion[];
  source: "llm";
  warning?: string;
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? "请求失败");
  }

  return response.json() as Promise<T>;
}

export function createSession(input: CreateSessionInput) {
  return request<InterviewSession>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getSession(id: string) {
  return request<InterviewSession>(`/api/sessions/${id}`);
}

export function analyzeProfile(input: {
  sessionId?: string;
  company: string;
  jobTitle: string;
  jdText: string;
  resumeText: string;
}) {
  return request<ProfileAgentResponse>("/api/analyze/profile", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function analyzeExperience(input: {
  sessionId?: string;
  company: string;
  jobTitle: string;
  experienceText: string;
  jdText?: string;
  resumeText?: string;
}) {
  return request<ExperienceAgentResponse>("/api/analyze/experience", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createPlan(input: { sessionId: string }) {
  return request<PlannerResponse>("/api/planner", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function generateFollowUp(input: {
  question: string;
  answer: string;
  expectedPoints: string[];
  tags: string[];
  type?: InterviewQuestion["type"];
  depth?: number;
}) {
  return request<FollowUpResult>("/api/interview/follow-up", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function evaluateInterviewAnswer(input: {
  question: string;
  answer: string;
  expectedPoints: string[];
  tags: string[];
  type?: InterviewQuestion["type"];
}) {
  return request<{ evaluation: EvaluationResult; memory: MemoryProfile }>("/api/interview/evaluate", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function savePracticeRecord(input: {
  sessionId: string;
  question: InterviewQuestion;
  answer: string;
  followUps: FollowUpResult["followUps"];
  evaluation: EvaluationResult;
}) {
  return request<{ record: InterviewPracticeRecord; session: InterviewSession }>("/api/interview/practice-records", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function generateReport(input: { sessionId: string }) {
  return request<{ report: InterviewReport; session: InterviewSession }>("/api/interview/report", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function optimizeExpression(input: { answer: string; question?: string; expectedPoints?: string[] }) {
  return request<ExpressionOptimization>("/api/interview/expression/optimize", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function reflectInterview(input: {
  question: string;
  answer: string;
  followUps: FollowUpResult["followUps"];
  evaluation?: EvaluationResult;
  expectedPoints: string[];
  tags: string[];
}) {
  return request<ReflectionResult>("/api/interview/reflect", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function generateKnowledgeTree(input: { sessionId: string }) {
  return request<KnowledgeTree>("/api/knowledge/tree", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateExperienceQuestions(input: { sessionId: string; questions: ExperienceQuestion[] }) {
  return request<{ analysis: ExperienceAnalysis; session: InterviewSession }>("/api/experience/questions", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function getModelConfig() {
  return request<ModelConfigInfo>("/api/config/model");
}

export function updateModelConfig(input: ModelConfigUpdate) {
  return request<ModelConfigInfo>("/api/config/model", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function parseResumeFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/resume/parse", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? "简历解析失败");
  }

  return response.json() as Promise<ParsedResume>;
}

export function getMemory() {
  return request<MemoryProfile>("/api/memory");
}
