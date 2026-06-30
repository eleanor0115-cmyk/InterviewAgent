import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationResult, MemoryProfile } from "../../src/shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
const memoryFile = path.join(dataDir, "memory.json");
const defaultCandidateId = "local-user";

function emptyMemory(candidateId = defaultCandidateId): MemoryProfile {
  return {
    candidateId,
    weakTags: [],
    strongTags: [],
    updatedAt: new Date().toISOString(),
    history: []
  };
}

async function ensureMemoryStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(memoryFile);
  } catch {
    await fs.writeFile(memoryFile, JSON.stringify(emptyMemory(), null, 2), "utf-8");
  }
}

export async function getMemoryProfile(candidateId = defaultCandidateId): Promise<MemoryProfile> {
  await ensureMemoryStore();
  const raw = await fs.readFile(memoryFile, "utf-8");
  const memory = JSON.parse(raw) as MemoryProfile;
  return memory.candidateId === candidateId ? memory : emptyMemory(candidateId);
}

export async function updateMemoryProfile(input: {
  question: string;
  tags: string[];
  evaluation: EvaluationResult;
  candidateId?: string;
}) {
  const memory = await getMemoryProfile(input.candidateId);
  const weakTags = new Set(memory.weakTags);
  const strongTags = new Set(memory.strongTags);

  for (const update of input.evaluation.memoryUpdates) {
    if (update.level === "weak") {
      weakTags.add(update.tag);
      strongTags.delete(update.tag);
    }

    if (update.level === "strong") {
      strongTags.add(update.tag);
      weakTags.delete(update.tag);
    }
  }

  const next: MemoryProfile = {
    ...memory,
    weakTags: [...weakTags].slice(0, 20),
    strongTags: [...strongTags].slice(0, 20),
    updatedAt: new Date().toISOString(),
    history: [
      {
        question: input.question,
        score: input.evaluation.score,
        tags: input.tags,
        weaknesses: input.evaluation.weaknesses,
        createdAt: new Date().toISOString()
      },
      ...memory.history
    ].slice(0, 30)
  };

  await fs.writeFile(memoryFile, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
