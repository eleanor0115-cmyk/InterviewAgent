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

const ragKindLabel = {
  interview_experience: "面经",
  training_memory: "记忆"
} as const;

function toPercent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
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

  const reverseQuestions = plan?.reverseQuestions ?? [];
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
                    <strong>{item}</strong>
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
                              <strong>岗位相关问题穿插</strong>
                              <span>具体题型和追问深度以模型生成的训练题与重点分配为准</span>
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
                              <span>{toPercent(focus.weight)}%</span>
                            </div>
                            <Progress percent={toPercent(focus.weight)} showInfo={false} strokeColor="#1f7a8c" />
                          </div>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
                <Col span={24}>
                  <Card className="panel-card" title="RAG 参考材料">
                    {plan.ragReferences && plan.ragReferences.length > 0 ? (
                      <List
                        dataSource={plan.ragReferences}
                        renderItem={(item) => (
                          <List.Item>
                            <div className="question-item">
                              <Space wrap>
                                <Tag color={item.kind === "interview_experience" ? "blue" : "purple"}>
                                  {ragKindLabel[item.kind]}
                                </Tag>
                                <Tag>{item.relevance}</Tag>
                              </Space>
                              <strong>{item.title}</strong>
                              <span>{item.reason}</span>
                            </div>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="暂无 RAG 参考材料" />
                    )}
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
                            <div className="reverse-question-copy">
                              <strong>{item.question}</strong>
                              <span>{item.reason}</span>
                              {item.followUpBridge && <em>{item.followUpBridge}</em>}
                            </div>
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
