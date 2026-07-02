import path from "node:path";

export const projectRoot = process.cwd();
export const serverDataDir = path.join(projectRoot, "server", "data");
export const defaultExperienceLibraryFile = path.join(projectRoot, "面经库.md");
