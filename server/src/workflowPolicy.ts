export type TrainingDecision = "reinforce" | "targeted_follow_up" | "complete";

export function decideNextTrainingStep(input: {
  score: number;
  currentRound: number;
  maxRounds: number;
  targetScore: number;
}): TrainingDecision {
  if (input.score >= input.targetScore || input.currentRound >= input.maxRounds) {
    return "complete";
  }

  return input.score < 60 ? "reinforce" : "targeted_follow_up";
}

export function normalizeQuestionText(question: string) {
  return question.toLowerCase().replace(/[\s，。！？、,.!?：:；;“”"'（）()\[\]【】]/g, "");
}

export function isDuplicateQuestion(candidate: string, askedQuestions: string[]) {
  const normalizedCandidate = normalizeQuestionText(candidate);
  return askedQuestions.some((question) => {
    const normalizedAsked = normalizeQuestionText(question);
    if (!normalizedCandidate || !normalizedAsked) return false;
    if (normalizedCandidate === normalizedAsked) return true;
    return normalizedCandidate.includes(normalizedAsked) || normalizedAsked.includes(normalizedCandidate);
  });
}
