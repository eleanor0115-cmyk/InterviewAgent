# InterviewAgent Pro

JD + 简历 + 面经驱动的 AI 面试官 Agent MVP。

## 已完成

- 第 1 天：React + TypeScript + Vite 前端骨架、Node 后端、本地 session 创建、资料输入页、基础路由。
- 第 2 天：Profile Analyzer Agent，输出 JD 关键词权重、简历优势、简历短板、岗位匹配度和准备优先级。
- 第 3 天：Experience Analyzer，解析面经题目、题型、标签、难度、高频知识点和公司面试风格。
- 第 4 天：Planner + Question Agent，使用三阶段决策模型生成面试计划和首轮问题：JD 定范围、面经排优先级、Gap 控追问深度。
- 第 5 天：Follow-up Agent，根据候选人回答生成 1-3 个针对性追问，并展示追问原因。
- 第 6 天：Evaluation + Memory，对单题回答做结构化评分，记录薄弱标签和历史训练表现。
- 第 7 天：Report Agent，汇总单题评分、Memory 和岗位画像生成复盘报告，支持 ECharts 雷达图和 Markdown 导出。
- 第 8-9 天：搜集面经管理页，支持维护用户搜集到的真实面经题，按类型/标签筛选，手动编辑题目、标签、难度和频次。
- 第 10 天：30 秒表达优化，把长回答压缩成“结论-背景-行动-结果”，并给出表达结构评分。
- 第 11 天：知识树页，从 JD、搜集面经、简历短板和训练重点生成 Mermaid 知识关系图。
- 第 12 天：Reflection Agent，对追问和评分做二次检查，发现缺少权衡、验证或 AI 边界时给出修订追问。
- 第 13 天：模型配置页，展示当前后端读取到的 OpenAI-compatible 配置，支持 DeepSeek / Qwen / OpenAI-compatible 的本地配置说明。
- 第 14 天：UI、README 和本地验证收尾。
- 分类体系：从研发专用“面试类型”升级为两层结构：通用问题类型 + 岗位域标签，适配技术、运营、产品、数据、市场等岗位。
- Prompt Playbook：沉淀行业/公司/商业等式、STAR、高压追问、差异化话术和工程表达升级原则。

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
npm run build
```

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
- `POST /api/interview/report`：生成整场复盘报告。
- `POST /api/knowledge/tree`：生成 Mermaid 知识树。
- `GET /api/config/model`：读取当前模型配置状态。
- `PUT /api/experience/questions`：更新用户搜集面经题目和标签。
- `GET /api/memory`：读取本地训练记忆。

## 页面

- `/`：资料输入，支持完整草稿缓存、简历缓存和一键清空资料。
- `/sessions/:id/plan`：准备方案、题库预览、单题训练。
- `/sessions/:id/library`：搜集面经管理，支持编辑用户搜集到的题目和标签。
- `/sessions/:id/knowledge`：知识树，展示 Mermaid 源码和节点说明。
- `/sessions/:id/report`：复盘报告、能力雷达图和 Markdown 导出。
- `/config/model`：模型配置状态。
