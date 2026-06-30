import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InterviewSession } from "../../src/shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
const sessionsFile = path.join(dataDir, "sessions.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(sessionsFile);
  } catch {
    await fs.writeFile(sessionsFile, "[]", "utf-8");
  }
}

export async function listSessions(): Promise<InterviewSession[]> {
  await ensureStore();
  const raw = await fs.readFile(sessionsFile, "utf-8");
  return JSON.parse(raw) as InterviewSession[];
}

export async function getSession(id: string): Promise<InterviewSession | undefined> {
  const sessions = await listSessions();
  return sessions.find((session) => session.id === id);
}

export async function saveSession(session: InterviewSession): Promise<InterviewSession> {
  const sessions = await listSessions();
  const index = sessions.findIndex((item) => item.id === session.id);

  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }

  await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2), "utf-8");
  return session;
}
