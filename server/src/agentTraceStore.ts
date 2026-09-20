import { nanoid } from "nanoid";
import { getDatabase, writeDatabase } from "./database.js";

export type AgentTraceInput = {
  traceId: string;
  agentName: string;
  schemaVersion: string;
  model: string;
  durationMs: number;
  retryCount: number;
  status: "success" | "failed";
  errorType?: string;
  errorMessage?: string;
};

export async function recordAgentTrace(input: AgentTraceInput) {
  const createdAt = new Date().toISOString();
  await writeDatabase((db) => {
    db.run(
      `INSERT INTO agent_traces
        (id, trace_id, agent_name, schema_version, model, duration_ms, retry_count, status, error_type, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nanoid(12),
        input.traceId,
        input.agentName,
        input.schemaVersion,
        input.model,
        input.durationMs,
        input.retryCount,
        input.status,
        input.errorType ?? "",
        input.errorMessage?.slice(0, 1000) ?? "",
        createdAt
      ]
    );
  });
}

export async function listAgentTraces(limit = 50) {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = db.exec(
    `SELECT trace_id, agent_name, schema_version, model, duration_ms, retry_count,
            status, error_type, error_message, created_at
       FROM agent_traces
      ORDER BY datetime(created_at) DESC
      LIMIT ?`,
    [safeLimit]
  )[0];

  return (rows?.values ?? []).map((value) => ({
    traceId: String(value[0]),
    agentName: String(value[1]),
    schemaVersion: String(value[2]),
    model: String(value[3]),
    durationMs: Number(value[4]),
    retryCount: Number(value[5]),
    status: String(value[6]),
    errorType: String(value[7] || ""),
    errorMessage: String(value[8] || ""),
    createdAt: String(value[9])
  }));
}
