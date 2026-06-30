import type { InterviewSession, KnowledgeTree } from "../../src/shared/types.js";

function nodeId(index: number) {
  return `N${index}`;
}

function sanitizeLabel(label: string) {
  return label.replace(/["<>]/g, "").slice(0, 28);
}

export function createKnowledgeTree(session: InterviewSession): KnowledgeTree {
  const nodes: KnowledgeTree["nodes"] = [
    {
      id: "ROOT",
      label: `${session.company} ${session.jobTitle}`,
      level: 0,
      tags: ["面试目标"]
    }
  ];
  const edges: KnowledgeTree["edges"] = [];
  let index = 1;

  function addChild(parent: string, label: string, level: number, tags: string[], reason: string) {
    const id = nodeId(index);
    index += 1;
    nodes.push({ id, label, level, tags });
    edges.push({ from: parent, to: id, reason });
    return id;
  }

  const jdRoot = addChild("ROOT", "JD 考纲", 1, ["JD"], "岗位要求决定考纲范围");
  for (const keyword of session.profileAnalysis?.jobKeywords.slice(0, 6) ?? []) {
    addChild(jdRoot, keyword.name, 2, ["JD 关键词"], keyword.reason);
  }

  const interviewRoot = addChild("ROOT", "搜集面经", 1, ["面经"], "用户搜集面经决定高频优先级");
  for (const tag of session.experienceAnalysis?.hotTags.slice(0, 6) ?? []) {
    addChild(interviewRoot, tag.name, 2, ["高频标签"], `出现 ${tag.count} 次`);
  }

  const gapRoot = addChild("ROOT", "简历短板", 1, ["Gap"], "简历短板决定追问深度");
  for (const gap of session.profileAnalysis?.gaps.slice(0, 5) ?? []) {
    addChild(gapRoot, gap.name, 2, [gap.risk], gap.suggestion);
  }

  const planRoot = addChild("ROOT", "训练重点", 1, ["Planner"], "Planner 输出下一轮训练重点");
  for (const focus of session.interviewPlan?.focusAreas.slice(0, 5) ?? []) {
    addChild(planRoot, focus.name, 2, ["重点分配"], focus.reason);
  }

  const mermaidLines = [
    "graph TD",
    ...nodes.map((node) => `  ${node.id}[\"${sanitizeLabel(node.label)}\"]`),
    ...edges.map((edge) => `  ${edge.from} --> ${edge.to}`)
  ];

  return {
    mermaid: mermaidLines.join("\n"),
    nodes,
    edges
  };
}
