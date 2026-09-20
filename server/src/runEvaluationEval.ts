import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluateAnswer } from "./evaluationAgent.js";
import { evaluationEvalCases } from "./evaluationEvalCases.js";
import { serverDataDir } from "./paths.js";

const repeats = Math.max(2, Number(process.env.EVAL_REPEATS ?? 2));
const maxAllowedSpread = Number(process.env.EVAL_MAX_SCORE_SPREAD ?? 15);

function round(value: number) {
  return Math.round(value * 10) / 10;
}

async function main() {
  const cases = [];
  for (const fixture of evaluationEvalCases) {
    const scores: number[] = [];
    for (let run = 0; run < repeats; run += 1) {
      const result = await evaluateAnswer(fixture);
      scores.push(result.score);
    }
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const spread = Math.max(...scores) - Math.min(...scores);
    cases.push({
      id: fixture.id,
      level: fixture.level,
      scores,
      average: round(average),
      spread,
      expectedScore: fixture.expectedScore,
      rangePassed: average >= fixture.expectedScore.min && average <= fixture.expectedScore.max,
      stabilityPassed: spread <= maxAllowedSpread
    });
  }

  const averages = new Map(cases.map((item) => [item.level, item.average]));
  const orderingPassed =
    (averages.get("weak") ?? 100) < (averages.get("medium") ?? 0) &&
    (averages.get("medium") ?? 100) < (averages.get("strong") ?? 0);
  const passed = cases.every((item) => item.rangePassed && item.stabilityPassed) && orderingPassed;
  const report = {
    generatedAt: new Date().toISOString(),
    repeats,
    maxAllowedSpread,
    orderingPassed,
    passed,
    cases
  };

  await fs.mkdir(serverDataDir, { recursive: true });
  const reportFile = path.join(serverDataDir, "evaluation-eval-report.json");
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportFile, ...report }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
