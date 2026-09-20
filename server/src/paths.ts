import path from "node:path";

export const projectRoot = process.cwd();
export const serverDataDir = process.env.INTERVIEW_AGENT_DATA_DIR
  ? path.resolve(process.env.INTERVIEW_AGENT_DATA_DIR)
  : path.join(projectRoot, "server", "data");
export const defaultExperienceLibraryFile = path.join(projectRoot, "面经库.md");
