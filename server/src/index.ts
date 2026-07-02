import cors from "cors";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InterviewSession } from "../../src/shared/types.js";
import { evaluateAnswer } from "./evaluationAgent.js";
import { analyzeExperience } from "./experienceAnalyzer.js";
import { optimizeAnswerExpression } from "./expressionAgent.js";
import { generateFollowUps } from "./followUpAgent.js";
import { createKnowledgeTree } from "./knowledgeTreeAgent.js";
import { getLlmRuntimeInfo, updateLlmRuntimeConfig } from "./llmClient.js";
import { getMemoryProfile, updateMemoryProfile } from "./memoryStore.js";
import { createInterviewPlan } from "./planner.js";
import { analyzeProfileWithAgent } from "./profileAgent.js";
import { getRagStats, retrieveRagContext, upsertTrainingMemoryDocument } from "./ragStore.js";
import { reflectInterviewResult } from "./reflectionAgent.js";
import { createReport } from "./reportAgent.js";
import { parseResumeFile } from "./resumeParser.js";
import {
  createSessionSchema,
  evaluationSchema,
  experienceAnalyzeSchema,
  experienceQuestionUpdateSchema,
  expressionOptimizeSchema,
  followUpSchema,
  knowledgeTreeSchema,
  modelConfigUpdateSchema,
  plannerSchema,
  practiceRecordSchema,
  profileAnalyzeSchema,
  reflectionSchema,
  reportSchema
} from "./schemas.js";
import { getSession, listSessions, saveSession } from "./storage.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024
  }
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDir = path.resolve(__dirname, "../../client");
const clientIndexFile = path.join(clientDistDir, "index.html");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_request, response, next) => {
  try {
    response.json({ ok: true, service: "InterviewAgent Pro API", llm: await getLlmRuntimeInfo(), rag: await getRagStats() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config/model", async (_request, response, next) => {
  try {
    response.json(await getLlmRuntimeInfo());
  } catch (error) {
    next(error);
  }
});

app.put("/api/config/model", async (request, response, next) => {
  try {
    const input = modelConfigUpdateSchema.parse(request.body);
    response.json(await updateLlmRuntimeConfig(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/resume/parse", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ message: "请上传简历文件" });
      return;
    }

    response.json(
      await parseResumeFile({
        fileName: request.file.originalname,
        mimetype: request.file.mimetype,
        buffer: request.file.buffer
      })
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions", async (_request, response, next) => {
  try {
    response.json(await listSessions());
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/:id", async (request, response, next) => {
  try {
    const session = await getSession(request.params.id);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    response.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions", async (request, response, next) => {
  try {
    const input = createSessionSchema.parse(request.body);
    const now = new Date().toISOString();
    const session: InterviewSession = {
      id: nanoid(10),
      ...input,
      experienceText: input.experienceText ?? "",
      createdAt: now,
      updatedAt: now
    };

    response.status(201).json(await saveSession(session));
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze/profile", async (request, response, next) => {
  try {
    const input = profileAnalyzeSchema.parse(request.body);
    const result = await analyzeProfileWithAgent(input);

    if (input.sessionId) {
      const session = await getSession(input.sessionId);
      if (session) {
        await saveSession({
          ...session,
          profileAnalysis: result.analysis,
          updatedAt: new Date().toISOString()
        });
      }
    }

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze/experience", async (request, response, next) => {
  try {
    const input = experienceAnalyzeSchema.parse(request.body);
    const analysis = await analyzeExperience(input);

    if (input.sessionId) {
      const session = await getSession(input.sessionId);
      if (session) {
        await saveSession({
          ...session,
          experienceAnalysis: analysis,
          updatedAt: new Date().toISOString()
        });
      }
    }

    response.json({ analysis, source: "llm" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/planner", async (request, response, next) => {
  try {
    const input = plannerSchema.parse(request.body);
    const session = await getSession(input.sessionId);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    const memory = await getMemoryProfile();
    const ragContext = await retrieveRagContext({
      session,
      memory,
      kinds: ["interview_experience", "training_memory"],
      topK: 8
    });
    const result = await createInterviewPlan(session, ragContext);
    await saveSession({
      ...session,
      interviewPlan: result.plan,
      initialQuestions: result.questions,
      updatedAt: new Date().toISOString()
    });

    response.json({ ...result, source: "llm" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/follow-up", async (request, response, next) => {
  try {
    const input = followUpSchema.parse(request.body);
    response.json(await generateFollowUps(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/evaluate", async (request, response, next) => {
  try {
    const input = evaluationSchema.parse(request.body);
    const evaluation = await evaluateAnswer(input);
    const memory = await updateMemoryProfile({
      question: input.question,
      tags: input.tags,
      evaluation
    });

    response.json({ evaluation, memory });
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/expression/optimize", async (request, response, next) => {
  try {
    const input = expressionOptimizeSchema.parse(request.body);
    response.json(await optimizeAnswerExpression(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/reflect", async (request, response, next) => {
  try {
    const input = reflectionSchema.parse(request.body);
    response.json(await reflectInterviewResult(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/practice-records", async (request, response, next) => {
  try {
    const input = practiceRecordSchema.parse(request.body);
    const session = await getSession(input.sessionId);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    const record = {
      id: nanoid(10),
      question: input.question,
      answer: input.answer,
      followUps: input.followUps,
      evaluation: input.evaluation,
      createdAt: new Date().toISOString()
    };
    const updatedSession = await saveSession({
      ...session,
      practiceRecords: [record, ...(session.practiceRecords ?? [])].slice(0, 50),
      updatedAt: new Date().toISOString()
    });
    await upsertTrainingMemoryDocument(updatedSession, record);

    response.status(201).json({ record, session: updatedSession });
  } catch (error) {
    next(error);
  }
});

app.post("/api/knowledge/tree", async (request, response, next) => {
  try {
    const input = knowledgeTreeSchema.parse(request.body);
    const session = await getSession(input.sessionId);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    response.json(await createKnowledgeTree(session));
  } catch (error) {
    next(error);
  }
});

app.post("/api/interview/report", async (request, response, next) => {
  try {
    const input = reportSchema.parse(request.body);
    const session = await getSession(input.sessionId);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    const memory = await getMemoryProfile();
    const report = await createReport(session, memory);
    const updatedSession = await saveSession({
      ...session,
      report,
      updatedAt: new Date().toISOString()
    });

    response.json({ report, session: updatedSession });
  } catch (error) {
    next(error);
  }
});

app.put("/api/experience/questions", async (request, response, next) => {
  try {
    const input = experienceQuestionUpdateSchema.parse(request.body);
    const session = await getSession(input.sessionId);

    if (!session) {
      response.status(404).json({ message: "Session not found" });
      return;
    }

    if (!session.experienceAnalysis) {
      response.status(409).json({ message: "请先使用模型解析面经后再编辑题目" });
      return;
    }

    const updatedExperience = {
      ...session.experienceAnalysis,
      questions: input.questions
    };

    const updatedSession = await saveSession({
      ...session,
      experienceAnalysis: updatedExperience,
      updatedAt: new Date().toISOString()
    });

    response.json({ analysis: updatedExperience, session: updatedSession });
  } catch (error) {
    next(error);
  }
});

app.get("/api/memory", async (_request, response, next) => {
  try {
    response.json(await getMemoryProfile());
  } catch (error) {
    next(error);
  }
});

if (existsSync(clientIndexFile)) {
  app.use(express.static(clientDistDir));
  app.get("*", (_request, response) => {
    response.sendFile(clientIndexFile);
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === "object" && "issues" in error) {
    response.status(400).json({ message: "Validation failed", issues: error.issues });
    return;
  }

  console.error(error);
  response.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
});

app.listen(port, () => {
  console.log(`InterviewAgent Pro API listening on http://localhost:${port}`);
});
