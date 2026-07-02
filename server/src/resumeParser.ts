import mammoth from "mammoth";
import { createRequire } from "node:module";
import type { ParsedResume, ParsedResumeSection } from "../../src/shared/types.js";
import { asArray, asRecord, asString, asStringArray, unwrapPayload } from "./agentValidation.js";
import { resumeParserAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{ text: string }>;

type ResumeFileInput = {
  fileName: string;
  mimetype: string;
  buffer: Buffer;
};

const systemPrompt = [
  "你是 InterviewAgent 的 Resume Parser Agent。",
  "用户上传的简历原文已经由文件解析库读取成纯文本，你负责提取结构化字段和生成给面试 Agent 使用的简历摘要。",
  "必须提取 fields：name、phone、email、education、skills、projects、internships、workExperience、awards、other。",
  "formattedText 是后续 Agent 会读取的内容，严禁包含姓名、手机号、邮箱、微信、地址等个人隐私，也不要包含教育经历。",
  "formattedText 只保留与面试准备有关的技能、项目、实习、工作、奖项/成果信息。",
  "不要编造经历、学校、公司、指标或项目结果；原文没有的信息留空数组或省略隐私字段。",
  "输出必须是 JSON object，不要 Markdown 包裹，不要解释。"
].join("\n");

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeFileName(fileName: string) {
  const decoded = Buffer.from(fileName, "latin1").toString("utf-8");
  const mojibakeScore = (fileName.match(/[ÃÂäåæçèé]{1}|�/g) ?? []).length;
  const decodedHasCjk = /[\u4e00-\u9fa5]/.test(decoded);

  return mojibakeScore > 0 && decodedHasCjk ? decoded : fileName;
}

async function extractTextFromFile(input: ResumeFileInput) {
  const fileName = normalizeFileName(input.fileName);
  const lowerName = fileName.toLowerCase();

  if (input.mimetype === "application/pdf" || lowerName.endsWith(".pdf")) {
    const result = await pdfParse(input.buffer);
    return result.text;
  }

  if (
    input.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    return result.value;
  }

  if (input.mimetype.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return input.buffer.toString("utf-8");
  }

  throw new Error("暂只支持 PDF、DOCX、TXT 简历文件");
}

function buildUserPrompt(fileName: string, rawText: string) {
  return JSON.stringify(
    {
      outputSchema: {
        formattedText: "string，给 Agent 使用，不含姓名/手机/邮箱/教育经历",
        fields: {
          name: "string，可选",
          phone: "string，可选",
          email: "string，可选",
          education: ["string"],
          skills: ["string"],
          projects: [{ title: "string", items: ["string"] }],
          internships: [{ title: "string", items: ["string"] }],
          workExperience: [{ title: "string", items: ["string"] }],
          awards: ["string"],
          other: [{ title: "string", items: ["string"] }]
        }
      },
      input: {
        fileName,
        rawText: rawText.slice(0, 12000)
      }
    },
    null,
    2
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSections(value: unknown, context: string): ParsedResumeSection[] {
  return asArray(value, context)
    .map((item) => {
      const section = asRecord(item, `${context}[]`);
      return {
        title: asString(section.title, `${context}[].title`),
        items: asStringArray(section.items, `${context}[].items`, 20)
      };
    })
    .slice(0, 20);
}

function normalizeParsedResume(value: unknown, fileName: string, rawText: string): ParsedResume {
  const payload = unwrapPayload(value, ["resume", "result", "data"], "resumeParserResponse");
  const fields = asRecord(payload.fields, "resumeParserResponse.fields");

  return {
    fileName,
    rawText,
    formattedText: asString(payload.formattedText, "resumeParserResponse.formattedText"),
    fields: {
      name: optionalString(fields.name),
      phone: optionalString(fields.phone),
      email: optionalString(fields.email),
      education: asStringArray(fields.education, "resumeParserResponse.fields.education", 20),
      skills: asStringArray(fields.skills, "resumeParserResponse.fields.skills", 40),
      projects: normalizeSections(fields.projects, "resumeParserResponse.fields.projects"),
      internships: normalizeSections(fields.internships, "resumeParserResponse.fields.internships"),
      workExperience: normalizeSections(fields.workExperience, "resumeParserResponse.fields.workExperience"),
      awards: asStringArray(fields.awards, "resumeParserResponse.fields.awards", 20),
      other: normalizeSections(fields.other, "resumeParserResponse.fields.other")
    }
  };
}

export async function parseResumeFile(input: ResumeFileInput): Promise<ParsedResume> {
  const fileName = normalizeFileName(input.fileName);
  const rawText = normalizeText(await extractTextFromFile(input));

  if (rawText.length < 20) {
    throw new Error("未能从文件中解析出足够的简历文本，请尝试 PDF/DOCX 或直接粘贴文本");
  }

  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(fileName, rawText) }
    ],
    resumeParserAgentSchema
  );

  return normalizeParsedResume(extractJsonObject(raw), fileName, rawText);
}
