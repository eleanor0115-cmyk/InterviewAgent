import assert from "node:assert/strict";
import test from "node:test";
import { rankDocumentsByKeywords } from "./ragRetrieval.js";

test("关键词预检索优先返回公司和岗位匹配的面经", () => {
  const documents = [
    { id: "1", title: "甲公司后端面经", content: "缓存与数据库", metadata: { company: "甲公司", role: "后端开发" } },
    { id: "2", title: "通用产品面经", content: "用户增长", metadata: { company: "乙公司", role: "产品经理" } }
  ];
  const result = rankDocumentsByKeywords({
    documents,
    query: "甲公司 后端开发 缓存",
    company: "甲公司",
    jobTitle: "后端开发"
  });

  assert.equal(result[0]?.document.id, "1");
  assert.ok((result[0]?.keywordScore ?? 0) > (result[1]?.keywordScore ?? 0));
});
