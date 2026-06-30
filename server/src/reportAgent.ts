import type {
  EvaluationResult,
  InterviewPracticeRecord,
  InterviewReport,
  InterviewSession,
  MemoryProfile
} from "../../src/shared/types.js";

const dimensionLabels: Record<keyof EvaluationResult["dimensionScores"], string> = {
  relevance: "扣题",
  depth: "深度",
  structure: "结构",
  evidence: "证据",
  reflection: "复盘"
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function fallbackRecords(session: InterviewSession): InterviewPracticeRecord[] {
  return (session.initialQuestions ?? []).slice(0, 3).map((question, index) => ({
    id: `fallback-${index}`,
    question,
    answer: "",
    followUps: [],
    evaluation: {
      score: 0,
      dimensionScores: {
        relevance: 0,
        depth: 0,
        structure: 0,
        evidence: 0,
        reflection: 0
      },
      strengths: [],
      weaknesses: ["这道题还没有完成评分，建议先在单题训练中作答。"],
      missingPoints: question.expectedPoints,
      suggestedAnswer: question.expectedPoints,
      nextPractice: question.expectedPoints,
      memoryUpdates: question.tags.map((tag) => ({
        tag,
        level: "weak",
        reason: "尚未训练。"
      }))
    },
    createdAt: session.updatedAt
  }));
}

function buildThirtySecondRewrite(session: InterviewSession, records: InterviewPracticeRecord[]) {
  const strongestProject = session.profileAnalysis?.resumeStrengths[0]?.evidence[0] ?? "我做过一个和目标岗位相关的项目";
  const bestRecord = [...records].sort((a, b) => b.evaluation.score - a.evaluation.score)[0];
  const focus = bestRecord?.question.tags[0] ?? session.profileAnalysis?.summary.preparationPriority[0] ?? "项目深挖";
  const resultSignal = session.profileAnalysis?.resumeStrengths
    .flatMap((strength) => strength.evidence)
    .find((item) => /%|提升|降低|上线|效率|时间|指标|1s|天/.test(item));

  return [
    `我的核心匹配点是能把「${focus}」落到真实项目里。`,
    `以「${strongestProject}」为例，我不是只完成开发，而是先拆清核心问题和约束，再决定方案边界。`,
    resultSignal ? `结果上有「${resultSignal}」这样的验证。` : "结果上我会补充上线效果、效率变化或质量指标来证明方案有效。",
    "这件事也沉淀了我的方法：先定义问题，再做方案权衡，最后用数据或可验收标准收口。"
  ].join("");
}

function buildMarkdown(report: Omit<InterviewReport, "markdown">, session: InterviewSession) {
  const lines = [
    `# ${session.company} · ${session.jobTitle} 面试复盘`,
    "",
    `- 总分：${report.overallScore}`,
    `- 生成时间：${report.generatedAt}`,
    "",
    "## 总结",
    report.summary,
    "",
    "## 维度评分",
    ...report.radarData.map((item) => `- ${item.name}：${item.value}`),
    "",
    "## 优势",
    ...report.strengths.map((item) => `- ${item}`),
    "",
    "## 待补强",
    ...report.weaknesses.map((item) => `- ${item}`),
    "",
    "## 高风险题",
    ...report.riskyQuestions.map((item) => `- ${item.question}（${item.score}）：${item.reason}`),
    "",
    "## 下一轮训练计划",
    ...report.nextPlan.map((item) => `- ${item}`),
    "",
    "## 30 秒表达版本",
    report.thirtySecondRewrite
  ];

  return lines.join("\n");
}

export function createReport(session: InterviewSession, memory?: MemoryProfile): InterviewReport {
  const records =
    session.practiceRecords && session.practiceRecords.length > 0 ? session.practiceRecords : fallbackRecords(session);
  const scoredRecords = records.filter((record) => record.evaluation.score > 0);
  const scoreBase = scoredRecords.length > 0 ? scoredRecords : records;
  const dimensionKeys = Object.keys(dimensionLabels) as Array<keyof EvaluationResult["dimensionScores"]>;
  const dimensionScores = Object.fromEntries(
    dimensionKeys.map((key) => [key, average(scoreBase.map((record) => record.evaluation.dimensionScores[key]))])
  ) as EvaluationResult["dimensionScores"];
  const overallScore =
    scoredRecords.length > 0
      ? average(scoredRecords.map((record) => record.evaluation.score))
      : Math.max(45, Math.min(75, session.profileAnalysis?.summary.matchScore ?? 60));
  const weaknesses = unique([
    ...records.flatMap((record) => record.evaluation.weaknesses),
    ...(memory?.weakTags.map((tag) => `${tag} 仍需继续训练。`) ?? [])
  ]).slice(0, 8);
  const strengths = unique([
    ...records.flatMap((record) => record.evaluation.strengths),
    ...(session.profileAnalysis?.resumeStrengths.map((item) => item.title) ?? [])
  ]).slice(0, 6);
  const riskyQuestions = [...records]
    .sort((a, b) => a.evaluation.score - b.evaluation.score)
    .slice(0, 5)
    .map((record) => ({
      question: record.question.question,
      score: record.evaluation.score,
      reason: record.evaluation.weaknesses[0] ?? "建议继续补充回答细节。"
    }));
  const nextPlan = unique([
    ...records.flatMap((record) => record.evaluation.nextPractice),
    ...(session.profileAnalysis?.summary.preparationPriority.map((item) => `优先训练：${item}`) ?? []),
    ...(memory?.weakTags.map((tag) => `针对 ${tag} 再练一题，并补齐为什么、怎么验证和边界。`) ?? [])
  ]).slice(0, 8);
  const radarData = dimensionKeys.map((key) => ({
    name: dimensionLabels[key],
    value: dimensionScores[key]
  }));
  const summary =
    scoredRecords.length > 0
      ? `本轮完成 ${scoredRecords.length} 道题评分，平均分 ${overallScore}。接下来优先补强 ${weaknesses
          .slice(0, 2)
          .join("、") || "项目深度和表达结构"}。`
      : "还没有完整评分记录，报告先基于岗位画像、面试计划和待训练题生成，建议完成 2-3 道单题评分后刷新报告。";

  const reportWithoutMarkdown = {
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    overallScore,
    dimensionScores,
    radarData,
    summary,
    strengths,
    weaknesses,
    riskyQuestions,
    nextPlan,
    thirtySecondRewrite: buildThirtySecondRewrite(session, records)
  };

  return {
    ...reportWithoutMarkdown,
    markdown: buildMarkdown(reportWithoutMarkdown, session)
  };
}
