import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { serverDataDir } from "./paths.js";

const dbFile = path.join(serverDataDir, "interview-agent.sqlite");

let sqlModulePromise: Promise<SqlJsStatic> | undefined;
let dbPromise: Promise<Database> | undefined;
let writeQueue = Promise.resolve();

async function getSqlModule() {
  sqlModulePromise ??= initSqlJs();
  return sqlModulePromise;
}

async function persistDatabase(db: Database) {
  await fs.mkdir(serverDataDir, { recursive: true });
  const bytes = db.export();
  await fs.writeFile(dbFile, bytes);
}

async function runExclusive<T>(task: () => Promise<T>) {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function createSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_profiles (
      candidate_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rag_documents_kind ON rag_documents(kind);
    CREATE INDEX IF NOT EXISTS idx_rag_documents_source ON rag_documents(source_id);
  `);
}

async function loadDatabase() {
  const SQL = await getSqlModule();
  await fs.mkdir(serverDataDir, { recursive: true });

  let db: Database;
  try {
    const bytes = await fs.readFile(dbFile);
    db = new SQL.Database(bytes);
  } catch {
    db = new SQL.Database();
  }

  createSchema(db);
  await persistDatabase(db);
  return db;
}

export async function getDatabase() {
  dbPromise ??= loadDatabase();
  return dbPromise;
}

export async function saveDatabase() {
  const db = await getDatabase();
  await runExclusive(() => persistDatabase(db));
}

export async function writeDatabase<T>(task: (db: Database) => T | Promise<T>) {
  const db = await getDatabase();
  return runExclusive(async () => {
    const result = await task(db);
    await persistDatabase(db);
    return result;
  });
}

export function readJsonColumn<T>(db: Database, sql: string, params: SqlValue[] = []): T[] {
  const statement = db.prepare(sql, params);
  const rows: T[] = [];

  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      rows.push(JSON.parse(String(row.data)) as T);
    }
  } finally {
    statement.free();
  }

  return rows;
}
