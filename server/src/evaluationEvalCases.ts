import type { QuestionType } from "../../src/shared/types.js";

export type EvaluationEvalCase = {
  id: string;
  level: "weak" | "medium" | "strong";
  question: string;
  answer: string;
  expectedPoints: string[];
  tags: string[];
  type: QuestionType;
  expectedScore: { min: number; max: number };
};

export const evaluationEvalCases: EvaluationEvalCase[] = [
  {
    id: "rag-weak",
    level: "weak",
    question: "请介绍你会如何设计并评估一个企业知识库 RAG 系统。",
    answer: "RAG 就是先从知识库搜索内容，再让大模型根据搜索结果回答。我会使用向量数据库完成检索。",
    expectedPoints: ["数据处理", "混合召回", "重排", "引用证据", "离线评测", "线上监控"],
    tags: ["RAG", "AI工程"],
    type: "method_ability",
    expectedScore: { min: 0, max: 55 }
  },
  {
    id: "rag-medium",
    level: "medium",
    question: "请介绍你会如何设计并评估一个企业知识库 RAG 系统。",
    answer: "我会先清洗文档并按标题和段落切分，保存来源、版本和权限等元数据。查询时先过滤权限，再结合关键词和向量召回，最后使用重排模型选择上下文。回答中返回引用来源。离线阶段准备问题集观察召回率和答案正确性，线上记录用户反馈和无答案率。不过具体阈值需要结合数据集再校准。",
    expectedPoints: ["数据处理", "混合召回", "重排", "引用证据", "离线评测", "线上监控"],
    tags: ["RAG", "AI工程"],
    type: "method_ability",
    expectedScore: { min: 45, max: 82 }
  },
  {
    id: "rag-strong",
    level: "strong",
    question: "请介绍你会如何设计并评估一个企业知识库 RAG 系统。",
    answer: "我会先明确正确率、权限隔离和时延目标。入库时按文档结构切分，保留 sourceId、版本、部门权限和生效时间，并建立增量更新与旧版本失效机制。查询链路先做权限及业务域过滤，再并行执行 BM25 和向量召回，通过 RRF 合并后交给 reranker，低置信度时拒答；最终答案必须携带原文引用。离线用人工标注问题集测 Recall@5、MRR、引用正确率和拒答准确率，并分别做切分、召回和重排消融；线上记录各节点 P95、无答案率、引用点击和负反馈。发布时先回放固定评测集，再灰度 10%，指标退化就回滚，同时对 bad case 区分 retrieval、generation 和 knowledge gap 后定向修复。",
    expectedPoints: ["数据处理", "混合召回", "重排", "引用证据", "离线评测", "线上监控"],
    tags: ["RAG", "AI工程"],
    type: "method_ability",
    expectedScore: { min: 68, max: 100 }
  }
];
