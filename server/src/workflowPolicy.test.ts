import assert from "node:assert/strict";
import test from "node:test";
import { decideNextTrainingStep, isDuplicateQuestion } from "./workflowPolicy.js";

test("低于 60 分进入强化训练", () => {
  assert.equal(decideNextTrainingStep({ score: 59, currentRound: 1, maxRounds: 3, targetScore: 70 }), "reinforce");
});

test("60 到 69 分进入针对性追问", () => {
  assert.equal(decideNextTrainingStep({ score: 65, currentRound: 1, maxRounds: 3, targetScore: 70 }), "targeted_follow_up");
});

test("达标或达到最大轮次后结束", () => {
  assert.equal(decideNextTrainingStep({ score: 70, currentRound: 1, maxRounds: 3, targetScore: 70 }), "complete");
  assert.equal(decideNextTrainingStep({ score: 40, currentRound: 3, maxRounds: 3, targetScore: 70 }), "complete");
});

test("标准化后能够拦截重复题", () => {
  assert.equal(isDuplicateQuestion("请说明 RAG 的召回流程？", ["请说明RAG的召回流程"]), true);
  assert.equal(isDuplicateQuestion("如何校准 AI 评分？", ["请说明RAG的召回流程"]), false);
});
