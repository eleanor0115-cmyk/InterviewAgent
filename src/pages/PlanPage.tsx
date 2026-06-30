import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Button, Card, Col, Empty, List, Progress, Row, Skeleton, Space, Tabs, Tag, Timeline, Tooltip, Typography, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { analyzeExperience, analyzeProfile, createPlan, getSession } from "../api/client";
import { TrainingPanel } from "./TrainingPanel";
import { useSessionStore } from "../store/sessionStore";
import type { InterviewSession, JobDomain, RiskLevel } from "../shared/types";

const riskColor: Record<RiskLevel, string> = {
  low: "green",
  medium: "orange",
  high: "red"
};

const domainLabel: Record<JobDomain, string> = {
  frontend: "前端",
  backend: "后端",
  ai_engineering: "AI 工程",
  product: "产品",
  operations: "运营",
  data_analysis: "数据分析",
  marketing: "市场",
  business: "商业",
  general: "通用"
};

const priorityLabelRules: Array<[RegExp, string]> = [
  [/AI|大模型|LLM|Agent|Prompt|RAG|幻觉|模型|约束/i, "AI 边界"],
  [/项目|经历|深挖|技术难点|真实性/, "项目深挖"],
  [/权衡|取舍|方案|为什么|设计|替代/, "技术权衡"],
  [/量化|指标|数据|结果|效果|收益/, "量化结果"],
  [/自我介绍|STAR|表达|钩子|回答/, "表达结构"],
  [/反问|业务目标|用户分层|团队问题/, "反问准备"],
  [/八股|基础|原理|浏览器|手写|算法|力扣/, "基础巩固"],
  [/协作|沟通|跨部门|推进/, "协作案例"],
  [/业务|商业|行业|公司|竞品|用户|增长/, "业务理解"],
  [/性能|优化|首屏|渲染/, "性能优化"],
  [/安全|隐私|权限|XSS|CSRF|风控/, "安全边界"],
  [/系统|架构|并发|稳定|扩展/, "架构设计"]
];

function compactPriorityLabel(item: string) {
  const normalized = item.replace(/\s+/g, " ").trim();
  const matched = priorityLabelRules.find(([pattern]) => pattern.test(normalized));
  if (matched) return matched[1];

  const firstPhrase = normalized
    .split(/[，,。；;：:、]/)[0]
    .replace(/^(优先|重点|建议|需要|准备|补充|强化|完善|梳理)/, "")
    .trim();

  return firstPhrase.length > 10 ? firstPhrase.slice(0, 10) : firstPhrase;
}

function inferReverseQuestions(session: InterviewSession, analysis: NonNullable<InterviewSession["profileAnalysis"]>) {
  const keywordTopics = analysis.jobKeywords.slice(0, 4).map((item) => item.name);
  const hotTopics = session.experienceAnalysis?.hotTags.slice(0, 4).map((item) => item.name) ?? [];
  const gapTopics = analysis.gaps.slice(0, 3).map((item) => item.name);
  const topics = [...new Set([...keywordTopics, ...hotTopics, ...gapTopics])].filter(Boolean);
  const text = `${session.jobTitle}\n${session.jdText}\n${session.resumeText}`;
  const domains = new Set(session.jobDomains ?? []);
  const isOps = domains.has("operations") || /运营|增长|用户运营|内容运营|活动运营|社群|留存|转化/i.test(text);
  const isProduct = domains.has("product") || /产品经理|产品实习|需求|PRD|用户体验|竞品|路线图/i.test(text);
  const isBusiness = domains.has("business") || domains.has("marketing") || domains.has("data_analysis");
  const isTech =
    domains.has("frontend") ||
    domains.has("backend") ||
    domains.has("ai_engineering") ||
    /前端|后端|研发|工程师|AI工程|算法|大模型|React|Node|Java|Go|TypeScript|系统|架构/i.test(text);
  const audience = /下沉|低线|三四线|县城|本地生活/i.test(text)
    ? "下沉或低线用户"
    : /一二线|高净值|白领|城市/i.test(text)
      ? "一二线或高线用户"
      : /B端|企业|商家|客户|SaaS|销售/i.test(text)
        ? "企业客户或商家"
        : /开发者|工程师|技术用户|API|平台/i.test(text)
          ? "开发者或技术用户"
          : /学生|校园|校招|应届/i.test(text)
            ? "学生或年轻用户"
            : "目标用户";
  const metricFocus = /留存|复购|活跃|粘性/i.test(text)
    ? "留存和活跃"
    : /转化|GMV|成交|付费|商业化/i.test(text)
      ? "转化和商业化"
      : /增长|拉新|获客|裂变/i.test(text)
        ? "增长和获客"
        : /效率|自动化|降本|提效/i.test(text)
          ? "效率提升"
          : "增长、留存、转化或效率";

  const base = isTech && !isOps && !isProduct && !isBusiness
    ? [
        {
          question: `围绕「${topics[0] ?? "这个岗位"}」，团队现在最希望技术侧解决的核心问题是什么？是性能、稳定性、交付效率，还是复杂业务抽象？`
        },
        {
          question: "这个岗位相关项目里，真正难的技术问题通常出现在哪一层？是方案权衡、系统边界、工程协作，还是线上质量保障？"
        },
        {
          question: "如果我参与到现有项目里，团队会更看重我先补齐业务理解、代码质量、排查问题能力，还是独立交付一个小模块的能力？"
        },
        {
          question: "团队现在判断一个技术方案是否做得好，主要看哪些指标或标准？比如稳定性、性能、可维护性、扩展性，还是对业务目标的支撑。"
        }
      ]
    : [
        {
          question: `我想了解一下，你们现在的用户分层通常是怎么划分的？会按使用频次、转化阶段、用户画像，还是按具体场景需求来分？`
        },
        {
          question: `如果现在主要服务的是「${audience}」，团队在策略上会和其他用户层级有什么不同吗？比如触达方式、产品路径或运营节奏上的差异。`
        },
        {
          question: `团队现阶段围绕「${topics[0] ?? "这条业务线"}」最核心的目标是什么？现在卡得比较明显的问题是在${metricFocus}，还是用户心智和场景渗透上？`
        },
        {
          question: "如果这个业务场景本身不是特别高频，团队现在会更偏向提升用户心智、增加触点，还是抓住少数关键场景做转化？"
        }
      ];

  if (isTech) {
    base.push({
      question: "从业务结果倒推的话，这个岗位相关项目里真正难的技术问题通常在哪里？是性能稳定性、方案权衡、工程协作，还是 AI/系统边界？"
    });
  }

  if (isOps) {
    base.push({
      question: "如果不同用户层级的目标差异比较大，团队会怎么判断该优先做哪一类用户？主要看规模、转化空间，还是长期价值？"
    });
  }

  if (isProduct) {
    base.push({
      question: "团队现在做需求优先级判断时，会更依赖用户反馈、业务指标、竞品变化，还是实现成本？这些因素冲突时一般怎么取舍？"
    });
  }

  base.push({
    question: isTech
      ? "如果我有机会加入，前 1-2 个月最希望我先熟悉哪类系统、业务模块或工程规范？我可以提前补哪类技术背景？"
      : "如果我有机会加入，前 1-2 个月最希望我先理解或推进的一类问题是什么？我可以提前补哪类业务背景或数据口径？"
  });

  return base.slice(0, 6);
}

export function PlanPage() {
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentSession = useSessionStore((state) => state.currentSession);
  const profileAnalysis = useSessionStore((state) => state.profileAnalysis);
  const profileWarning = useSessionStore((state) => state.profileWarning);
  const experienceAnalysis = useSessionStore((state) => state.experienceAnalysis);
  const interviewPlan = useSessionStore((state) => state.interviewPlan);
  const initialQuestions = useSessionStore((state) => state.initialQuestions);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const setProfileResult = useSessionStore((state) => state.setProfileResult);
  const setExperienceResult = useSessionStore((state) => state.setExperienceResult);
  const setPlannerResult = useSessionStore((state) => state.setPlannerResult);

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) return;

      setLoading(true);
      try {
        const session = await getSession(sessionId);
        setCurrentSession(session);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "读取 session 失败");
      } finally {
        setLoading(false);
      }
    }

    if (!currentSession || currentSession.id !== sessionId) {
      void loadSession();
    } else {
      setLoading(false);
    }
  }, [currentSession, sessionId, setCurrentSession]);

  const session = currentSession as InterviewSession | undefined;
  const analysis = profileAnalysis ?? session?.profileAnalysis;
  const experience = experienceAnalysis ?? session?.experienceAnalysis;
  const plan = interviewPlan ?? session?.interviewPlan;
  const allQuestions = initialQuestions ?? session?.initialQuestions ?? [];
  const questions = allQuestions.filter((question) => question.type !== "reverse_question");

  const weightedTotal = useMemo(() => {
    return analysis?.jobKeywords.reduce((sum, item) => sum + item.weight, 0) ?? 0;
  }, [analysis]);

  const handleRefresh = async () => {
    if (!session) return;

    setRefreshing(true);
    try {
      const result = await analyzeProfile({
        sessionId: session.id,
        company: session.company,
        jobTitle: session.jobTitle,
        jdText: session.jdText,
        resumeText: session.resumeText
      });
      setProfileResult(result);

      const experienceResult = await analyzeExperience({
        sessionId: session.id,
        company: session.company,
        jobTitle: session.jobTitle,
        experienceText: session.experienceText,
        jdText: session.jdText,
        resumeText: session.resumeText
      });
      setExperienceResult(experienceResult);

      const plannerResult = await createPlan({ sessionId: session.id });
      setPlannerResult(plannerResult);
      message.success("面试准备方案已刷新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  if (!session) {
    return <Empty description="未找到这份准备记录" />;
  }

  if (!analysis) {
    return (
      <Empty description="还没有生成准备方案">
        <Button type="primary" onClick={handleRefresh} loading={refreshing}>
          生成准备方案
        </Button>
      </Empty>
    );
  }

  const reverseQuestions = inferReverseQuestions(session, analysis);
  const isTechnicalRole =
    session.jobDomains?.some((domain) => ["frontend", "backend", "ai_engineering"].includes(domain)) ??
    /前端|后端|研发|工程师|AI工程|算法|大模型|React|Node|Java|Go|TypeScript|系统|架构/i.test(`${session.jobTitle}\n${session.jdText}`);

  return (
    <section className="analysis-page">
      <div className="analysis-heading">
        <div>
          <Typography.Title level={1}>{session.company} · {session.jobTitle}</Typography.Title>
          <Typography.Paragraph>
            已根据岗位、简历和搜集面经生成面试重点、训练题和反问准备。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={refreshing}>
            刷新方案
          </Button>
        </Space>
      </div>

      {profileWarning && <Alert className="stacked-alert" type="warning" showIcon message={profileWarning} />}

      <Row gutter={[16, 16]} className="overview-row">
        <Col xs={24} lg={7}>
          <Card className="overview-card" title="岗位匹配度">
            <div className="score-card-body">
              <Progress type="dashboard" percent={analysis.summary.matchScore} strokeColor="#1f7a8c" />
            </div>
            <div className="summary-list">
              <span>方向：{analysis.summary.roleDirection}</span>
              <span>{analysis.summary.senioritySignal}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card className="overview-card" title="准备优先级">
            <div className="priority-list">
              {analysis.summary.preparationPriority.map((item, index) => (
                <div className="priority-item" key={item}>
                  <span>{index + 1}</span>
                  <Tooltip title={item} placement="topLeft">
                    <strong>{compactPriorityLabel(item)}</strong>
                  </Tooltip>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card className="overview-card" title="出题策略">
            {plan ? (
              <div className="strategy-box compact">
                <strong>三阶段决策</strong>
                <span>JD 定范围</span>
                <span>面经排优先级</span>
                <span>Gap 控追问深度</span>
              </div>
            ) : (
              <div className="summary-list">
                <span>权重合计：{weightedTotal.toFixed(2)}</span>
                <span>等待生成训练计划</span>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Tabs
        className="analysis-tabs"
        items={[
          {
            key: "focus",
            label: "重点与短板",
            children: (
              <Row gutter={[16, 16]} className="focus-summary-row">
                <Col xs={24} xl={12}>
                  <Card className="panel-card" title="JD 关键词">
                    <div className="compact-keyword-grid">
                      {analysis.jobKeywords.slice(0, 6).map((item) => (
                        <div className="compact-keyword-row" key={item.name}>
                          <div className="compact-keyword-main">
                            <strong>{item.name}</strong>
                            <Tooltip title={item.reason} placement="topLeft">
                              <span title={item.reason}>{item.reason}</span>
                            </Tooltip>
                          </div>
                          <Tag color="cyan">{Math.round(item.weight * 100)}%</Tag>
                        </div>
                      ))}
                    </div>
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card className="panel-card" title="简历优势">
                    <List
                      dataSource={analysis.resumeStrengths.slice(0, 5)}
                      renderItem={(item) => (
                        <List.Item>
                          <div className="strength-item">
                            <strong>{item.title}</strong>
                            <div className="evidence-list">
                              {item.matchedKeywords.map((keyword) => (
                                <Tag color="blue" key={keyword}>{keyword}</Tag>
                              ))}
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
                <Col span={24}>
                  <Card className="panel-card" title="简历短板与准备建议">
                    <div className="gap-grid">
                      {analysis.gaps.map((gap) => (
                        <Card size="small" className="gap-card" key={gap.name}>
                          <Space className="gap-title">
                            <strong>{gap.name}</strong>
                            <Tag color={riskColor[gap.risk]}>{gap.risk}</Tag>
                            {gap.missingFromResume && <Tag>简历缺失</Tag>}
                          </Space>
                          <p>{gap.suggestion}</p>
                        </Card>
                      ))}
                    </div>
                  </Card>
                </Col>
              </Row>
            )
          },
          {
            key: "experience",
            label: "搜集面经",
            children: experience && experience.questions.length > 0 ? (
              <Row gutter={[16, 16]} className="paired-card-row">
                <Col xs={24} xl={8}>
                  <Card className="panel-card" title="高频标签">
                    <div className="hot-tag-list">
                      {experience.hotTags.map((tag) => (
                        <Tag className="hot-tag" key={tag.name}>
                          <span>{tag.name}</span>
                          <strong>×{tag.count}</strong>
                        </Tag>
                      ))}
                    </div>
                    <div className="summary-list">
                      <span>题目数：{experience.summary.questionCount}</span>
                      <span>项目深度：{experience.companyStyle.projectDepth}</span>
                      <span>基础考察：{experience.companyStyle.basicKnowledge}</span>
                      <span>压力强度：{experience.companyStyle.pressureLevel}</span>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} xl={16}>
                  <Card className="panel-card" title="高频问题">
                    <List
                      dataSource={experience.questions.slice(0, 8)}
                      renderItem={(item) => (
                        <List.Item>
                          <div className="question-item">
                            <Space wrap>
                              {item.domainTags.map((domain) => (
                                <Tag color="cyan" key={domain}>{domainLabel[domain]}</Tag>
                              ))}
                              <Tag color={item.difficulty === "hard" ? "red" : item.difficulty === "medium" ? "orange" : "green"}>
                                {item.difficulty}
                              </Tag>
                              <Tag>频次 {item.frequency}</Tag>
                            </Space>
                            <strong>{item.question}</strong>
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
              </Row>
            ) : (
              <Empty description="暂无搜集面经。你可以回到资料输入粘贴面经，或在搜集面经页手动维护题目。" />
            )
          },
          {
            key: "plan",
            label: "训练计划",
            children: plan ? (
              <Row gutter={[16, 16]} className="paired-card-row">
                <Col xs={24} xl={8}>
                  <Card className="panel-card" title="参考节奏">
                    <Timeline
                      items={[
                        {
                          children: (
                            <div className="round-item">
                              <strong>自我介绍</strong>
                              <span>开场校准经历主线</span>
                            </div>
                          )
                        },
                        {
                          children: (
                            <div className="round-item">
                              <strong>项目 / 经历深挖</strong>
                              <span>围绕简历证据追问技术难点、方案权衡和结果验证</span>
                            </div>
                          )
                        },
                        {
                          children: (
                            <div className="round-item">
                              <strong>{isTechnicalRole ? "技术基础 / 开放题穿插" : "业务案例 / 开放题穿插"}</strong>
                              <span>
                                {isTechnicalRole
                                  ? "八股、手写、AI 开放题和业务理解会按技术岗位穿插出现"
                                  : "业务理解、场景案例、协作推进和开放判断会按岗位穿插出现"}
                              </span>
                            </div>
                          )
                        },
                        {
                          children: (
                            <div className="round-item">
                              <strong>反问收尾</strong>
                              <span>围绕团队目标、用户场景、指标权衡或技术难题提问</span>
                            </div>
                          )
                        }
                      ]}
                    />
                  </Card>
                </Col>
                <Col xs={24} xl={16}>
                  <Card className="panel-card" title={`重点分配 · ${plan.durationMinutes} 分钟`}>
                    <List
                      dataSource={plan.focusAreas}
                      renderItem={(focus) => (
                        <List.Item>
                          <div className="keyword-item compact">
                            <div className="keyword-topline">
                              <strong>{focus.name}</strong>
                              <span>{Math.round(focus.weight * 100)}%</span>
                            </div>
                            <Progress percent={Math.round(focus.weight * 100)} showInfo={false} strokeColor="#1f7a8c" />
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
              </Row>
            ) : (
              <Empty description="暂无训练计划" />
            )
          },
          {
            key: "reverse",
            label: "反问准备",
            children: (
              <Row gutter={[16, 16]} className="paired-card-row">
                <Col span={24}>
                  <Card className="panel-card reverse-question-card" title="可以直接反问的问题">
                    <List
                      dataSource={reverseQuestions}
                      renderItem={(item, index) => (
                        <List.Item>
                          <div className="reverse-question-item">
                            <Tag color="cyan">{index + 1}</Tag>
                            <strong>{item.question}</strong>
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
              </Row>
            )
          },
          {
            key: "training",
            label: "单题训练",
            children: (
              <TrainingPanel
                sessionId={session.id}
                questions={questions}
                domainLabel={domainLabel}
                onSessionUpdated={async () => {
                  const updatedSession = await getSession(session.id);
                  setCurrentSession(updatedSession);
                }}
              />
            )
          }
        ]}
      />
    </section>
  );
}
