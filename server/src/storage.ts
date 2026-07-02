import { promises as fs } from "node:fs";
import path from "node:path";
import type { InterviewSession } from "../../src/shared/types.js";
import { getDatabase, readJsonColumn, writeDatabase } from "./database.js";
import { serverDataDir } from "./paths.js";

const legacySessionsFile = path.join(serverDataDir, "sessions.json");

let migrationPromise: Promise<void> | undefined;

async function migrateLegacySessions() {
  const db = await getDatabase();
  const existing = db.exec("SELECT COUNT(*) AS count FROM sessions");
  const count = Number(existing[0]?.values[0]?.[0] ?? 0);
  if (count > 0) return;

  try {
    const raw = await fs.readFile(legacySessionsFile, "utf-8");
    const sessions = JSON.parse(raw) as InterviewSession[];
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    await writeDatabase((database) => {
      const statement = database.prepare(
        "INSERT OR REPLACE INTO sessions (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)"
      );

      try {
        for (const session of sessions) {
          statement.run([session.id, JSON.stringify(session), session.createdAt, session.updatedAt]);
        }
      } finally {
        statement.free();
      }
    });
  } catch {
    return;
  }
}

async function ensureMigrated() {
  migrationPromise ??= migrateLegacySessions();
  await migrationPromise;
}

export async function listSessions(): Promise<InterviewSession[]> {
  await ensureMigrated();
  const db = await getDatabase();
  return readJsonColumn<InterviewSession>(
    db,
    "SELECT data FROM sessions ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC"
  );
}

export async function getSession(id: string): Promise<InterviewSession | undefined> {
  await ensureMigrated();
  const db = await getDatabase();
  return readJsonColumn<InterviewSession>(db, "SELECT data FROM sessions WHERE id = ?", [id])[0];
}

export async function saveSession(session: InterviewSession): Promise<InterviewSession> {
  await ensureMigrated();
  await writeDatabase((db) => {
    db.run("INSERT OR REPLACE INTO sessions (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)", [
      session.id,
      JSON.stringify(session),
      session.createdAt,
      session.updatedAt
    ]);
  });
  return session;
}
