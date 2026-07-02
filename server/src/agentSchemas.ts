import { difficultyValues, jobDomainValues, levelValues, memoryLevelValues, questionTypeValues } from "./agentValidation.js";

type JsonSchema = Record<string, unknown>;

const stringArray = {
  type: "array",
  items: { type: "string" }
} satisfies JsonSchema;

const optionalString = {
  anyOf: [{ type: "string" }, { type: "null" }]
} satisfies JsonSchema;

const questionTypeSchema = {
  type: "string",
  enum: questionTypeValues
} satisfies JsonSchema;

const jobDomainSchema = {
  type: "string",
  enum: jobDomainValues
} satisfies JsonSchema;

const difficultySchema = {
  type: "string",
  enum: difficultyValues
} satisfies JsonSchema;

const dimensionScoresSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relevance", "depth", "structure", "evidence", "reflection"],
  properties: {
    relevance: { type: "number", minimum: 0, maximum: 100 },
    depth: { type: "number", minimum: 0, maximum: 100 },
    structure: { type: "number", minimum: 0, maximum: 100 },
    evidence: { type: "number", minimum: 0, maximum: 100 },
    reflection: { type: "number", minimum: 0, maximum: 100 }
  }
} satisfies JsonSchema;

const memoryUpdateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tag", "level", "reason"],
  properties: {
    tag: { type: "string" },
    level: { type: "string", enum: memoryLevelValues },
    reason: { type: "string" }
  }
} satisfies JsonSchema;

const evaluationResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "dimensionScores",
    "strengths",
    "weaknesses",
    "missingPoints",
    "suggestedAnswer",
    "nextPractice",
    "memoryUpdates"
  ],
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    dimensionScores: dimensionScoresSchema,
    strengths: stringArray,
    weaknesses: stringArray,
    missingPoints: stringArray,
    suggestedAnswer: stringArray,
    nextPractice: stringArray,
    memoryUpdates: {
      type: "array",
      items: memoryUpdateSchema
    }
  }
} satisfies JsonSchema;

const followUpQuestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "reason", "focus"],
  properties: {
    question: { type: "string" },
    reason: { type: "string" },
    focus: { type: "string" }
  }
} satisfies JsonSchema;

const structuredSectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "items"],
  properties: {
    title: { type: "string" },
    items: stringArray
  }
} satisfies JsonSchema;

export const profileAgentSchema = {
  name: "profile_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["jobKeywords", "resumeStrengths", "gaps", "summary"],
    properties: {
      jobKeywords: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "weight", "reason", "evidence"],
          properties: {
            name: { type: "string" },
            weight: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
            evidence: stringArray
          }
        }
      },
      resumeStrengths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "evidence", "matchedKeywords"],
          properties: {
            title: { type: "string" },
            evidence: stringArray,
            matchedKeywords: stringArray
          }
        }
      },
      gaps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "risk", "suggestion", "missingFromResume", "jdEvidence"],
          properties: {
            name: { type: "string" },
            risk: { type: "string", enum: ["low", "medium", "high"] },
            suggestion: { type: "string" },
            missingFromResume: { type: "boolean" },
            jdEvidence: stringArray
          }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["matchScore", "roleDirection", "senioritySignal", "preparationPriority"],
        properties: {
          matchScore: { type: "number", minimum: 0, maximum: 100 },
          roleDirection: { type: "string" },
          senioritySignal: { type: "string" },
          preparationPriority: stringArray
        }
      }
    }
  }
};

export const experienceAgentSchema = {
  name: "experience_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["questions", "companyStyle", "hotTags", "summary"],
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "type", "domainTags", "tags", "difficulty", "frequency", "source"],
          properties: {
            question: { type: "string" },
            type: questionTypeSchema,
            domainTags: { type: "array", items: jobDomainSchema },
            tags: stringArray,
            difficulty: difficultySchema,
            frequency: { type: "number", minimum: 1 },
            source: { type: "string" }
          }
        }
      },
      companyStyle: {
        type: "object",
        additionalProperties: false,
        required: ["projectDepth", "basicKnowledge", "pressureLevel", "commonPatterns"],
        properties: {
          projectDepth: { type: "string", enum: levelValues },
          basicKnowledge: { type: "string", enum: levelValues },
          pressureLevel: { type: "string", enum: levelValues },
          commonPatterns: stringArray
        }
      },
      hotTags: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "count"],
          properties: {
            name: { type: "string" },
            count: { type: "number", minimum: 0 }
          }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["questionCount", "hardestTags", "recommendedFocus"],
        properties: {
          questionCount: { type: "number", minimum: 0 },
          hardestTags: stringArray,
          recommendedFocus: stringArray
        }
      }
    }
  }
};

export const plannerAgentSchema = {
  name: "planner_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["plan", "questions"],
    properties: {
      plan: {
        type: "object",
        additionalProperties: false,
        required: ["durationMinutes", "strategy", "focusAreas", "rounds", "reverseQuestions"],
        properties: {
          durationMinutes: { type: "number", minimum: 30, maximum: 120 },
          strategy: {
            type: "object",
            additionalProperties: false,
            required: ["mode", "weights", "rules"],
            properties: {
              mode: { type: "string", enum: ["three_stage_decision"] },
              weights: {
                type: "object",
                additionalProperties: false,
                required: ["jd", "interview", "gap"],
                properties: {
                  jd: { type: "number", minimum: 0, maximum: 1 },
                  interview: { type: "number", minimum: 0, maximum: 1 },
                  gap: { type: "number", minimum: 0, maximum: 1 }
                }
              },
              rules: stringArray
            }
          },
          focusAreas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "weight", "reason"],
              properties: {
                name: { type: "string" },
                weight: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" }
              }
            }
          },
          rounds: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "questionCount", "followUpDepth"],
              properties: {
                type: { type: "string" },
                questionCount: { type: "number", minimum: 1, maximum: 6 },
                followUpDepth: { type: "number", minimum: 1, maximum: 3 }
              }
            }
          },
          reverseQuestions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question", "reason", "followUpBridge"],
              properties: {
                question: { type: "string" },
                reason: { type: "string" },
                followUpBridge: { type: "string" }
              }
            }
          }
        }
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "type", "domainTags", "tags", "difficulty", "expectedPoints", "sourceReason"],
          properties: {
            question: { type: "string" },
            type: questionTypeSchema,
            domainTags: { type: "array", items: jobDomainSchema },
            tags: stringArray,
            difficulty: difficultySchema,
            expectedPoints: stringArray,
            sourceReason: { type: "string" }
          }
        }
      }
    }
  }
};

export const followUpAgentSchema = {
  name: "follow_up_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["followUps", "summary"],
    properties: {
      followUps: { type: "array", items: followUpQuestionSchema },
      summary: { type: "string" }
    }
  }
};

export const evaluationAgentSchema = {
  name: "evaluation_result",
  schema: evaluationResultSchema
};

export const expressionAgentSchema = {
  name: "expression_optimization",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["original", "optimized", "structureScore", "structure", "suggestions"],
    properties: {
      original: { type: "string" },
      optimized: { type: "string" },
      structureScore: { type: "number", minimum: 0, maximum: 100 },
      structure: {
        type: "object",
        additionalProperties: false,
        required: ["conclusion", "background", "action", "result"],
        properties: {
          conclusion: { type: "string" },
          background: { type: "string" },
          action: { type: "string" },
          result: { type: "string" }
        }
      },
      suggestions: stringArray
    }
  }
};

export const reflectionAgentSchema = {
  name: "reflection_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "confidence", "issues", "revisedFollowUps", "revisedEvaluation"],
    properties: {
      verdict: { type: "string", enum: ["pass", "revise"] },
      confidence: { type: "number", minimum: 0, maximum: 100 },
      issues: stringArray,
      revisedFollowUps: { type: "array", items: followUpQuestionSchema },
      revisedEvaluation: {
        anyOf: [evaluationResultSchema, { type: "null" }]
      }
    }
  }
};

export const reportAgentSchema = {
  name: "interview_report",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "overallScore",
      "dimensionScores",
      "summary",
      "strengths",
      "weaknesses",
      "riskyQuestions",
      "nextPlan",
      "thirtySecondRewrite",
      "markdown"
    ],
    properties: {
      overallScore: { type: "number", minimum: 0, maximum: 100 },
      dimensionScores: dimensionScoresSchema,
      summary: { type: "string" },
      strengths: stringArray,
      weaknesses: stringArray,
      riskyQuestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "score", "reason"],
          properties: {
            question: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 100 },
            reason: { type: "string" }
          }
        }
      },
      nextPlan: stringArray,
      thirtySecondRewrite: { type: "string" },
      markdown: { type: "string" }
    }
  }
};

export const knowledgeTreeAgentSchema = {
  name: "knowledge_tree",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["mermaid", "nodes", "edges"],
    properties: {
      mermaid: { type: "string" },
      nodes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "level", "tags"],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            level: { type: "number" },
            tags: stringArray
          }
        }
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to", "reason"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            reason: { type: "string" }
          }
        }
      }
    }
  }
};

export const resumeParserAgentSchema = {
  name: "parsed_resume",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["formattedText", "fields"],
    properties: {
      formattedText: { type: "string" },
      fields: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "phone",
          "email",
          "education",
          "skills",
          "projects",
          "internships",
          "workExperience",
          "awards",
          "other"
        ],
        properties: {
          name: optionalString,
          phone: optionalString,
          email: optionalString,
          education: stringArray,
          skills: stringArray,
          projects: { type: "array", items: structuredSectionSchema },
          internships: { type: "array", items: structuredSectionSchema },
          workExperience: { type: "array", items: structuredSectionSchema },
          awards: stringArray,
          other: { type: "array", items: structuredSectionSchema }
        }
      }
    }
  }
};

export const ragRerankAgentSchema = {
  name: "rag_rerank_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["hits"],
    properties: {
      hits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "relevance", "reason"],
          properties: {
            id: { type: "string" },
            relevance: { type: "number", minimum: 0, maximum: 100 },
            reason: { type: "string" }
          }
        }
      }
    }
  }
};
