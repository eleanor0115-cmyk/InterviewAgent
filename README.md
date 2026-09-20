# InterviewAgent Pro

JD + 简历 + 面经驱动的 AI 面试训练 Agent。

## 核心能力

- 后端 `TrainingRun` 持久化训练轮次、历史得分、已出题目和失败状态。
- 低于 60 分进入同知识点强化，60-69 分进入缺失点追问，达到 70 分或第 3 轮结束。
- 幂等键、并发提交拦截和事务保存保证训练记录、Memory 与运行状态一致。
- 所有结构化 AI 节点统一经过 `AgentExecutor`，完成 JSON 提取、运行时校验、一次修复和 Trace。
- RAG 使用公司/岗位/关键词预召回和模型重排，并返回来源、摘要与命中词。
- Memory 按知识点记录训练次数、最近分、平均分、最高分和最后训练时间。

## 分类体系

第一层是通用问题类型，决定“怎么问”：

- 业务理解
- 经历验证
- 能力方法
- 场景实战
- 协作沟通
- 压力追问
- 反问准备

第二层是岗位域标签，决定“问什么领域”：

- 前端、后端、AI 工程
- 产品、运营、数据分析
- 市场、商业、通用

这样同一套流程既能问 React/Node/系统设计，也能问用户分层、增长转化、竞品分析、指标归因。

## 模型配置

项目支持 OpenAI-compatible API。复制 `.env.example` 为 `.env` 后填写：

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Profile Analyzer 依赖模型配置。没有配置 `OPENAI_API_KEY`，或模型请求失败时，接口会直接报错，不再使用本地规则兜底。

## 运行

```bash
npm install
npm run dev
```

- 前端：http://localhost:5174
- 后端：http://localhost:3001
- 健康检查：http://localhost:3001/api/health

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run eval:evaluation
```

`npm test` 包含规则单元测试和使用假模型、临时数据库的 HTTP 工作流集成测试。`npm run eval:evaluation` 使用当前模型重复评分弱、中、强三档固定样本，并生成 `server/data/evaluation-eval-report.json`。

## 当前 API

- `POST /api/sessions`：创建本地面试 session。
- `GET /api/sessions`：查看历史 session。
- `GET /api/sessions/:id`：查看 session 详情。
- `POST /api/analyze/profile`：运行 Profile Analyzer Agent。
- `POST /api/analyze/experience`：运行 Experience Analyzer。
- `POST /api/planner`：生成面试计划和首轮问题。
- `POST /api/interview/follow-up`：根据回答生成追问。
- `POST /api/interview/evaluate`：评分并更新本地 Memory。
- `POST /api/interview/expression/optimize`：生成 30 秒表达优化和结构评分。
- `POST /api/interview/reflect`：Reflection 二次检查追问和评分。
- `POST /api/interview/practice-records`：保存单题训练记录到当前 session。
- `POST /api/training-runs`：创建或恢复某道基础题的训练运行。
- `GET /api/training-runs/:id`：读取当前轮次、历史分数和训练状态。
- `POST /api/training-runs/:id/answers`：幂等提交回答并自动执行评分、强化或结束分支。
- `POST /api/interview/report`：生成整场复盘报告。
- `POST /api/knowledge/tree`：生成 Mermaid 知识树。
- `GET /api/config/model`：读取当前模型配置状态。
- `PUT /api/experience/questions`：更新用户搜集面经题目和标签。
- `GET /api/memory`：读取本地训练记忆。
- `GET /api/agent-traces`：读取模型、耗时、重试和错误 Trace。

## 页面

- `/`：资料输入，支持完整草稿缓存、简历缓存和一键清空资料。
- `/sessions/:id/plan`：准备方案、题库预览、单题训练。
- `/sessions/:id/library`：搜集面经管理，支持编辑用户搜集到的题目和标签。
- `/sessions/:id/knowledge`：知识树，展示 Mermaid 源码和节点说明。
- `/sessions/:id/report`：复盘报告、能力雷达图和 Markdown 导出。
- `/config/model`：模型配置状态。
