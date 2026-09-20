import assert from "node:assert/strict";
import test from "node:test";
import type { EvaluationResult, MemoryProfile } from "../../src/shared/types.js";
import { buildUpdatedMemory } from "./memoryStore.js";

const emptyMemory: MemoryProfile = {
  candidateId: "test-user",
  weakTags: [],
  strongTags: [],
  knowledgeMastery: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
  history: []
};

function evaluation(score: number): EvaluationResult {
  return {
    score,
    dimensionScores: { relevance: score, depth: score, structure: score, evidence: score, reflection: score },
    strengths: [],
    weaknesses: ["证据不足"],
    missingPoints: [],
    suggestedAnswer: [],
    nextPractice: [],
    memoryUpdates: [{ tag: "RAG", level: score >= 70 ? "strong" : "weak", reason: "测试" }]
  };
}

test("Memory 累计知识点训练次数和平均分", () => {
  const first = buildUpdatedMemory({
    memory: emptyMemory,
    question: "RAG 是什么",
    tags: ["RAG"],
    evaluation: evaluation(50),
    practicedAt: "2026-01-02T00:00:00.000Z"
  });
  const second = buildUpdatedMemory({
    memory: first,
    question: "RAG 如何召回",
    tags: ["RAG"],
    evaluation: evaluation(80),
    practicedAt: "2026-01-03T00:00:00.000Z"
  });

  assert.deepEqual(second.knowledgeMastery[0], {
    knowledgePoint: "RAG",
    attempts: 2,
    latestScore: 80,
    averageScore: 65,
    bestScore: 80,
    lastPracticedAt: "2026-01-03T00:00:00.000Z"
  });
  assert.deepEqual(second.strongTags, ["RAG"]);
  assert.equal(second.history.length, 2);
});
