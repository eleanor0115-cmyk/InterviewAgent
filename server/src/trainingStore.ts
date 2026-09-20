import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  InterviewPracticeRecord,
  InterviewQuestion,
  InterviewSession,
  MemoryProfile,
  TrainingRun,
  TrainingSubmissionResult
} from "../../src/shared/types.js";
import { getDatabase, readJsonColumn, writeDatabase } from "./database.js";
import { evaluateAnswer } from "./evaluationAgent.js";
import { generateFollowUps } from "./followUpAgent.js";
import { buildUpdatedMemory } from "./memoryStore.js";
import { upsertTrainingMemoryDocument } from "./ragStore.js";
import { getSession } from "./storage.js";
import { decideNextTrainingStep, isDuplicateQuestion, normalizeQuestionText } from "./workflowPolicy.js";

const defaultCandidateId = "local-user";

export class TrainingConflictError extends Error {}

function baseQuestionKey(question: InterviewQuestion) {
  return createHash("sha256").update(normalizeQuestionText(question.question)).digest("hex").slice(0, 24);
}

function readRunById(runId: string) {
  return getDatabase().then(
    (db) => readJsonColumn<TrainingRun>(db, "SELECT data FROM training_runs WHERE id = ?", [runId])[0]
  );
}

export async function getTrainingRun(runId: string) {
  return readRunById(runId);
}

export async function getOrCreateTrainingRun(sessionId: string, question: InterviewQuestion) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");

  const questionKey = baseQuestionKey(question);
  const db = await getDatabase();
  const existing = readJsonColumn<TrainingRun>(
    db,
    "SELECT data FROM training_runs WHERE session_id = ? AND base_question_key = ?",
    [sessionId, questionKey]
  )[0];
  if (existing) return existing;

  const now = new Date().toISOString();
  const run: TrainingRun = {
    id: nanoid(12),
    sessionId,
    baseQuestionKey: questionKey,
    stage: "ready",
    originalQuestion: question,
    currentQuestion: question,
    currentRound: 1,
    maxRounds: 3,
    targetScore: 70,
    scoreHistory: [],
    askedQuestions: [question.question],
    attempts: [],
    createdAt: now,
    updatedAt: now
  };

  await writeDatabase((database) => {
    database.run(
      `INSERT OR IGNORE INTO training_runs
        (id, session_id, base_question_key, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [run.id, sessionId, questionKey, JSON.stringify(run), now, now]
    );
  });

  const stored = await getDatabase();
  return (
    readJsonColumn<TrainingRun>(
      stored,
      "SELECT data FROM training_runs WHERE session_id = ? AND base_question_key = ?",
      [sessionId, questionKey]
    )[0] ?? run
  );
}

async function reserveSubmission(idempotencyKey: string, runId: string) {
  return writeDatabase((db) => {
    const rows = db.exec(
      "SELECT status, response FROM training_submissions WHERE idempotency_key = ?",
      [idempotencyKey]
    )[0];
    const existing = rows?.values[0];
    if (existing?.[0] === "completed" && existing[1]) {
      return { replay: JSON.parse(String(existing[1])) as TrainingSubmissionResult };
    }
    if (existing?.[0] === "pending") {
      throw new TrainingConflictError("该回答正在评分，请勿重复提交");
    }

    const run = readJsonColumn<TrainingRun>(db, "SELECT data FROM training_runs WHERE id = ?", [runId])[0];
    if (!run) throw new Error("Training run not found");
    if (run.stage === "evaluating") throw new TrainingConflictError("该题正在评分，请勿重复提交");
    if (run.stage === "completed") throw new TrainingConflictError("该训练已经完成");

    const now = new Date().toISOString();
    const evaluatingRun = { ...run, stage: "evaluating" as const, lastError: undefined, updatedAt: now };
    db.run("UPDATE training_runs SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(evaluatingRun), now, runId]);
    db.run(
      `INSERT OR REPLACE INTO training_submissions
        (idempotency_key, run_id, status, response, error, created_at, updated_at)
       VALUES (?, ?, 'pending', NULL, NULL, ?, ?)`,
      [idempotencyKey, runId, now, now]
    );
    return {};
  });
}

async function markFailed(idempotencyKey: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  await writeDatabase((db) => {
    db.run(
      "UPDATE training_submissions SET status = 'failed', error = ?, updated_at = ? WHERE idempotency_key = ?",
      [message, now, idempotencyKey]
    );
    const run = readJsonColumn<TrainingRun>(db, "SELECT data FROM training_runs WHERE id = ?", [runId])[0];
    if (run) {
      const failedRun = { ...run, stage: "failed" as const, lastError: message, updatedAt: now };
      db.run("UPDATE training_runs SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(failedRun), now, runId]);
    }
  });
}

async function generateNextQuestion(run: TrainingRun, answer: string, weaknesses: string[], decision: "reinforce" | "targeted_follow_up") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generateFollowUps({
      question: run.currentQuestion.question,
      answer: [answer, `本轮缺失点：${weaknesses.join("；")}`, "请从相同知识点换一个角度继续考察。"].join("\n"),
      expectedPoints: run.currentQuestion.expectedPoints,
      tags: run.currentQuestion.tags,
      type: run.currentQuestion.type,
      depth: 3
    });
    const candidate = result.followUps.find((item) => !isDuplicateQuestion(item.question, run.askedQuestions));
    if (candidate) {
      return {
        ...run.currentQuestion,
        question: candidate.question,
        expectedPoints: weaknesses,
        sourceReason: decision === "reinforce" ? "低于 60 分，进入同知识点强化训练" : "尚未达到目标分，针对缺失点继续追问"
      } satisfies InterviewQuestion;
    }
  }

  throw new Error("模型连续生成重复题目，请稍后重试");
}

export async function submitTrainingAnswer(input: {
  runId: string;
  answer: string;
  idempotencyKey: string;
  followUps?: InterviewPracticeRecord["followUps"];
}) {
  const reservation = await reserveSubmission(input.idempotencyKey, input.runId);
  if (reservation.replay) return { ...reservation.replay, replayed: true };

  try {
    const run = await readRunById(input.runId);
    if (!run) throw new Error("Training run not found");
    if (run.stage === "completed") throw new TrainingConflictError("该训练已经完成");

    const evaluation = await evaluateAnswer({
      question: run.currentQuestion.question,
      answer: input.answer,
      expectedPoints: run.currentQuestion.expectedPoints,
      tags: run.currentQuestion.tags,
      type: run.currentQuestion.type
    });
    const decision = decideNextTrainingStep({
      score: evaluation.score,
      currentRound: run.currentRound,
      maxRounds: run.maxRounds,
      targetScore: run.targetScore
    });
    const nextQuestion = decision === "complete"
      ? run.currentQuestion
      : await generateNextQuestion(run, input.answer, evaluation.missingPoints, decision);
    const now = new Date().toISOString();
    const attemptId = nanoid(10);
    const trainingAttempt = {
      id: attemptId,
      round: run.currentRound,
      question: run.currentQuestion,
      answer: input.answer,
      evaluation,
      createdAt: now
    };
    const nextRun: TrainingRun = {
      ...run,
      stage: decision === "complete" ? "completed" : "reinforcing",
      currentQuestion: nextQuestion,
      currentRound: decision === "complete" ? run.currentRound : run.currentRound + 1,
      scoreHistory: [...run.scoreHistory, evaluation.score],
      askedQuestions: decision === "complete" ? run.askedQuestions : [...run.askedQuestions, nextQuestion.question],
      attempts: [...run.attempts, trainingAttempt],
      lastError: undefined,
      updatedAt: now
    };
    let result: TrainingSubmissionResult | undefined;

    await writeDatabase((db) => {
      const session = readJsonColumn<InterviewSession>(db, "SELECT data FROM sessions WHERE id = ?", [run.sessionId])[0];
      if (!session) throw new Error("Session not found");
      const storedMemory = readJsonColumn<MemoryProfile>(
        db,
        "SELECT data FROM memory_profiles WHERE candidate_id = ?",
        [defaultCandidateId]
      )[0];
      const memory: MemoryProfile = storedMemory ?? {
        candidateId: defaultCandidateId,
        weakTags: [],
        strongTags: [],
        knowledgeMastery: [],
        updatedAt: now,
        history: []
      };

      const record: InterviewPracticeRecord = {
        id: attemptId,
        question: run.currentQuestion,
        answer: input.answer,
        followUps: input.followUps ?? [],
        evaluation,
        createdAt: now
      };
      const updatedSession: InterviewSession = {
        ...session,
        practiceRecords: [record, ...(session.practiceRecords ?? [])].slice(0, 50),
        updatedAt: now
      };
      const updatedMemory = buildUpdatedMemory({
        memory: { ...memory, knowledgeMastery: memory.knowledgeMastery ?? [] },
        question: run.currentQuestion.question,
        tags: run.currentQuestion.tags,
        evaluation,
        practicedAt: now
      });
      result = { run: nextRun, attempt: trainingAttempt, memory: updatedMemory, session: updatedSession, decision };

      db.run("BEGIN TRANSACTION");
      try {
        db.run("UPDATE training_runs SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(nextRun), now, run.id]);
        db.run("UPDATE sessions SET data = ?, updated_at = ? WHERE id = ?", [JSON.stringify(updatedSession), now, session.id]);
        db.run("INSERT OR REPLACE INTO memory_profiles (candidate_id, data, updated_at) VALUES (?, ?, ?)", [
          defaultCandidateId,
          JSON.stringify(updatedMemory),
          now
        ]);
        db.run(
          "UPDATE training_submissions SET status = 'completed', response = ?, error = NULL, updated_at = ? WHERE idempotency_key = ?",
          [JSON.stringify(result), now, input.idempotencyKey]
        );
        db.run("COMMIT");
      } catch (error) {
        db.run("ROLLBACK");
        throw error;
      }
    });

    if (!result) throw new Error("训练结果保存失败");
    const savedRecord: InterviewPracticeRecord = {
      id: result.attempt.id,
      question: result.attempt.question,
      answer: result.attempt.answer,
      followUps: input.followUps ?? [],
      evaluation: result.attempt.evaluation,
      createdAt: result.attempt.createdAt
    };
    await upsertTrainingMemoryDocument(result.session, savedRecord).catch((error) => {
      console.warn("Training result saved, but RAG memory indexing failed", error);
    });
    return result;
  } catch (error) {
    await markFailed(input.idempotencyKey, input.runId, error);
    throw error;
  }
}
