import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvaluationResult, MemoryProfile } from "../../src/shared/types.js";
import { getDatabase, readJsonColumn, writeDatabase } from "./database.js";
import { serverDataDir } from "./paths.js";

const legacyMemoryFile = path.join(serverDataDir, "memory.json");
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

let migrationPromise: Promise<void> | undefined;

async function migrateLegacyMemory() {
  const db = await getDatabase();
  const existing = db.exec("SELECT COUNT(*) AS count FROM memory_profiles");
  const count = Number(existing[0]?.values[0]?.[0] ?? 0);
  if (count > 0) return;

  try {
    const raw = await fs.readFile(legacyMemoryFile, "utf-8");
    const memory = JSON.parse(raw) as MemoryProfile;
    if (!memory?.candidateId) return;

    await writeDatabase((database) => {
      database.run("INSERT OR REPLACE INTO memory_profiles (candidate_id, data, updated_at) VALUES (?, ?, ?)", [
        memory.candidateId,
        JSON.stringify(memory),
        memory.updatedAt
      ]);
    });
  } catch {
    return;
  }
}

async function ensureMigrated() {
  migrationPromise ??= migrateLegacyMemory();
  await migrationPromise;
}

export async function getMemoryProfile(candidateId = defaultCandidateId): Promise<MemoryProfile> {
  await ensureMigrated();
  const db = await getDatabase();
  return (
    readJsonColumn<MemoryProfile>(db, "SELECT data FROM memory_profiles WHERE candidate_id = ?", [candidateId])[0] ??
    emptyMemory(candidateId)
  );
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

  await writeDatabase((db) => {
    db.run("INSERT OR REPLACE INTO memory_profiles (candidate_id, data, updated_at) VALUES (?, ?, ?)", [
      next.candidateId,
      JSON.stringify(next),
      next.updatedAt
    ]);
  });

  return next;
}
