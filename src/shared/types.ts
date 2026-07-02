export type QuestionType =
  | "business_understanding"
  | "experience_validation"
  | "method_ability"
  | "scenario_practice"
  | "collaboration"
  | "pressure_challenge"
  | "reverse_question";

export type JobDomain =
  | "frontend"
  | "backend"
  | "ai_engineering"
  | "product"
  | "operations"
  | "data_analysis"
  | "marketing"
  | "business"
  | "general";

export type InterviewType = QuestionType;

export type RiskLevel = "low" | "medium" | "high";

export type JobKeyword = {
  name: string;
  weight: number;
  reason: string;
  evidence: string[];
};

export type ExperienceQuestion = {
  question: string;
  type: QuestionType;
  domainTags: JobDomain[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  frequency: number;
  source: string;
};

export type ExperienceAnalysis = {
  questions: ExperienceQuestion[];
  companyStyle: {
    projectDepth: "low" | "medium" | "high";
    basicKnowledge: "low" | "medium" | "high";
    pressureLevel: "low" | "medium" | "high";
    commonPatterns: string[];
  };
  hotTags: {
    name: string;
    count: number;
  }[];
  summary: {
    questionCount: number;
    hardestTags: string[];
    recommendedFocus: string[];
  };
};

export type ResumeStrength = {
  title: string;
  evidence: string[];
  matchedKeywords: string[];
};

export type ResumeGap = {
  name: string;
  risk: RiskLevel;
  suggestion: string;
  missingFromResume: boolean;
  jdEvidence: string[];
};

export type ProfileAnalysis = {
  jobKeywords: JobKeyword[];
  resumeStrengths: ResumeStrength[];
  gaps: ResumeGap[];
  summary: {
    matchScore: number;
    roleDirection: string;
    senioritySignal: string;
    preparationPriority: string[];
  };
};

export type InterviewPlan = {
  durationMinutes: number;
  strategy: {
    mode: "three_stage_decision";
    weights: {
      jd: number;
      interview: number;
      gap: number;
    };
    rules: string[];
  };
  focusAreas: {
    name: string;
    weight: number;
    reason: string;
  }[];
  rounds: {
    type: string;
    questionCount: number;
    followUpDepth: number;
  }[];
  reverseQuestions: {
    question: string;
    reason: string;
    followUpBridge?: string;
  }[];
  ragReferences?: {
    id: string;
    kind: "interview_experience" | "training_memory";
    title: string;
    relevance: number;
    reason: string;
    metadata: Record<string, unknown>;
  }[];
};

export type InterviewQuestion = {
  question: string;
  type: QuestionType;
  domainTags: JobDomain[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  expectedPoints: string[];
  sourceReason: string;
};

export type FollowUpQuestion = {
  question: string;
  reason: string;
  focus: string;
};

export type FollowUpResult = {
  followUps: FollowUpQuestion[];
  summary: string;
};

export type EvaluationResult = {
  score: number;
  dimensionScores: {
    relevance: number;
    depth: number;
    structure: number;
    evidence: number;
    reflection: number;
  };
  strengths: string[];
  weaknesses: string[];
  missingPoints: string[];
  suggestedAnswer: string[];
  nextPractice: string[];
  memoryUpdates: {
    tag: string;
    level: "weak" | "medium" | "strong";
    reason: string;
  }[];
};

export type ExpressionOptimization = {
  original: string;
  optimized: string;
  structureScore: number;
  structure: {
    conclusion: string;
    background: string;
    action: string;
    result: string;
  };
  suggestions: string[];
};

export type KnowledgeTree = {
  mermaid: string;
  nodes: {
    id: string;
    label: string;
    level: number;
    tags: string[];
  }[];
  edges: {
    from: string;
    to: string;
    reason: string;
  }[];
};

export type ReflectionResult = {
  verdict: "pass" | "revise";
  confidence: number;
  issues: string[];
  revisedFollowUps: FollowUpQuestion[];
  revisedEvaluation?: EvaluationResult;
};

export type ModelConfigInfo = {
  configured: boolean;
  baseUrl: string;
  model: string;
  providerHint: string;
  apiKeyMasked: string;
  source: "env" | "local_file";
  envKeys: string[];
};

export type ModelConfigUpdate = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};

export type ParsedResumeSection = {
  title: string;
  items: string[];
};

export type ParsedResume = {
  fileName: string;
  rawText: string;
  formattedText: string;
  fields: {
    name?: string;
    phone?: string;
    email?: string;
    education: string[];
    skills: string[];
    projects: ParsedResumeSection[];
    internships: ParsedResumeSection[];
    workExperience: ParsedResumeSection[];
    awards: string[];
    other: ParsedResumeSection[];
  };
};

export type InterviewPracticeRecord = {
  id: string;
  question: InterviewQuestion;
  answer: string;
  followUps: FollowUpQuestion[];
  evaluation: EvaluationResult;
  createdAt: string;
};

export type InterviewReport = {
  sessionId: string;
  generatedAt: string;
  overallScore: number;
  dimensionScores: EvaluationResult["dimensionScores"];
  radarData: {
    name: string;
    value: number;
  }[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  riskyQuestions: {
    question: string;
    score: number;
    reason: string;
  }[];
  nextPlan: string[];
  thirtySecondRewrite: string;
  markdown: string;
};

export type MemoryProfile = {
  candidateId: string;
  weakTags: string[];
  strongTags: string[];
  updatedAt: string;
  history: {
    question: string;
    score: number;
    tags: string[];
    weaknesses: string[];
    createdAt: string;
  }[];
};

export type InterviewSession = {
  id: string;
  company: string;
  jobTitle: string;
  jdText: string;
  resumeText: string;
  experienceText: string;
  questionTypes: QuestionType[];
  jobDomains: JobDomain[];
  profileAnalysis?: ProfileAnalysis;
  experienceAnalysis?: ExperienceAnalysis;
  interviewPlan?: InterviewPlan;
  initialQuestions?: InterviewQuestion[];
  practiceRecords?: InterviewPracticeRecord[];
  report?: InterviewReport;
  createdAt: string;
  updatedAt: string;
};

export type CreateSessionInput = {
  company: string;
  jobTitle: string;
  jdText: string;
  resumeText: string;
  experienceText: string;
  questionTypes: QuestionType[];
  jobDomains: JobDomain[];
};
