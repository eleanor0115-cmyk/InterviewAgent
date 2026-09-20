import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type FakeModelState = {
  evaluationScores: number[];
  invalidResponsesRemaining: number;
  followUpIndex: number;
  delayMs: number;
};

function evaluationPayload(score: number) {
  return {
    score,
    dimensionScores: { relevance: score, depth: score, structure: score, evidence: score, reflection: score },
    strengths: ["结构清楚"],
    weaknesses: ["证据不足"],
    missingPoints: ["补充量化结果"],
    suggestedAnswer: ["补充验证过程"],
    nextPractice: ["继续练习"],
    memoryUpdates: [{ tag: "RAG", level: score >= 70 ? "strong" : "weak", reason: "固定测试样本" }]
  };
}

async function startFakeModel(state: FakeModelState) {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
    const schemaName = body.response_format?.json_schema?.name;
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));

    let content: string;
    if (schemaName === "evaluation_result") {
      if (state.invalidResponsesRemaining > 0) {
        state.invalidResponsesRemaining -= 1;
        content = JSON.stringify({ invalid: true });
      } else {
        content = JSON.stringify(evaluationPayload(state.evaluationScores.shift() ?? 75));
      }
    } else if (schemaName === "follow_up_response") {
      state.followUpIndex += 1;
      content = JSON.stringify({
        followUps: [
          { question: `请补充第 ${state.followUpIndex} 个不同角度的验证过程？`, reason: "验证深度", focus: "RAG" },
          { question: `第 ${state.followUpIndex} 轮如何衡量召回效果？`, reason: "量化结果", focus: "RAG" }
        ],
        summary: "继续围绕相同知识点训练"
      });
    } else {
      content = JSON.stringify({});
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake model failed to listen");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

async function waitForHealth(baseUrl: string, child: ChildProcess) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error("Test API did not become ready");
}

async function api<T>(baseUrl: string, route: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload: payload as T };
}

const question = {
  question: "请说明 RAG 检索链路如何设计？",
  type: "method_ability",
  domainTags: ["ai_engineering"],
  tags: ["RAG"],
  difficulty: "medium",
  expectedPoints: ["召回", "重排", "评测"],
  sourceReason: "固定集成测试"
};

test("训练 HTTP 工作流支持三轮分支、恢复、幂等、并发拦截和失败重试", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "interview-agent-test-"));
  const state: FakeModelState = {
    evaluationScores: [55, 65, 75, 55, 55, 75],
    invalidResponsesRemaining: 0,
    followUpIndex: 0,
    delayMs: 0
  };
  const fakeModel = await startFakeModel(state);
  const appPort = 43000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const child = spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(appPort),
      INTERVIEW_AGENT_DATA_DIR: tempDir,
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: fakeModel.baseUrl,
      OPENAI_MODEL: "fixed-test-model"
    },
    stdio: "pipe"
  });
  let childLogs = "";
  child.stdout?.on("data", (chunk) => { childLogs += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { childLogs += chunk.toString(); });

  t.after(async () => {
    child.kill();
    fakeModel.server.close();
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]).catch(() => undefined);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  try {
    await waitForHealth(baseUrl, child);
    const sessionResponse = await api<any>(baseUrl, "/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        company: "测试公司",
        jobTitle: "AI 工程师",
        jdText: "负责检索增强生成系统设计、评测、监控和持续优化。",
        resumeText: "负责过知识库检索、模型调用、效果评测和服务稳定性建设。",
        experienceText: "",
        questionTypes: ["method_ability"],
        jobDomains: ["ai_engineering"]
      })
    });
    assert.equal(sessionResponse.status, 201);

    const runResponse = await api<any>(baseUrl, "/api/training-runs", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionResponse.payload.id, question })
    });
    assert.equal(runResponse.status, 200);
    const runId = runResponse.payload.id;

    const first = await api<any>(baseUrl, `/api/training-runs/${runId}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "第一轮回答", idempotencyKey: "fixed-key-1", followUps: [] })
    });
    assert.equal(first.status, 200);
    assert.equal(first.payload.decision, "reinforce");
    assert.equal(first.payload.run.currentRound, 2);

    const replay = await api<any>(baseUrl, `/api/training-runs/${runId}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "第一轮回答", idempotencyKey: "fixed-key-1", followUps: [] })
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.payload.replayed, true);
    assert.equal(replay.payload.run.attempts.length, 1);

    const restored = await api<any>(baseUrl, `/api/training-runs/${runId}`);
    assert.equal(restored.payload.currentRound, 2);
    assert.equal(restored.payload.attempts.length, 1);

    const second = await api<any>(baseUrl, `/api/training-runs/${runId}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "第二轮回答", idempotencyKey: "fixed-key-2", followUps: [] })
    });
    assert.equal(second.payload.decision, "targeted_follow_up");
    assert.equal(second.payload.run.currentRound, 3);

    const third = await api<any>(baseUrl, `/api/training-runs/${runId}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "第三轮回答", idempotencyKey: "fixed-key-3", followUps: [] })
    });
    assert.equal(third.payload.decision, "complete");
    assert.equal(third.payload.run.stage, "completed");
    assert.deepEqual(third.payload.run.scoreHistory, [55, 65, 75]);
    assert.equal(third.payload.memory.knowledgeMastery[0].attempts, 3);

    const failureRun = await api<any>(baseUrl, "/api/training-runs", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionResponse.payload.id, question: { ...question, question: "失败恢复测试题" } })
    });
    state.invalidResponsesRemaining = 2;
    const failed = await api<any>(baseUrl, `/api/training-runs/${failureRun.payload.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "格式失败", idempotencyKey: "retry-key-1", followUps: [] })
    });
    assert.equal(failed.status, 500);
    const retried = await api<any>(baseUrl, `/api/training-runs/${failureRun.payload.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "格式失败", idempotencyKey: "retry-key-1", followUps: [] })
    });
    assert.equal(retried.status, 200);

    const concurrentRun = await api<any>(baseUrl, "/api/training-runs", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionResponse.payload.id, question: { ...question, question: "并发提交测试题" } })
    });
    state.delayMs = 150;
    const firstRequest = api<any>(baseUrl, `/api/training-runs/${concurrentRun.payload.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "并发回答", idempotencyKey: "concurrent-key-1", followUps: [] })
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const duplicateRequest = await api<any>(baseUrl, `/api/training-runs/${concurrentRun.payload.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answer: "并发回答", idempotencyKey: "concurrent-key-2", followUps: [] })
    });
    assert.equal(duplicateRequest.status, 409);
    assert.equal((await firstRequest).status, 200);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChild logs:\n${childLogs}`);
  }
});
