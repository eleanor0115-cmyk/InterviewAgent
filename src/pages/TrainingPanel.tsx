import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Empty, Input, Progress, Row, Select, Space, Tag, Typography, message } from "antd";
import {
  evaluateInterviewAnswer,
  generateFollowUp,
  optimizeExpression,
  reflectInterview,
  savePracticeRecord
} from "../api/client";
import type {
  EvaluationResult,
  ExpressionOptimization,
  FollowUpResult,
  InterviewQuestion,
  JobDomain,
  MemoryProfile,
  ReflectionResult
} from "../shared/types";

type TrainingPanelProps = {
  sessionId: string;
  questions: InterviewQuestion[];
  domainLabel: Record<JobDomain, string>;
  onSessionUpdated?: () => void;
};

const dimensionLabel: Record<keyof EvaluationResult["dimensionScores"], string> = {
  relevance: "扣题",
  depth: "深度",
  structure: "结构",
  evidence: "证据",
  reflection: "复盘"
};

export function TrainingPanel({ sessionId, questions, domainLabel, onSessionUpdated }: TrainingPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [followUpResult, setFollowUpResult] = useState<FollowUpResult>();
  const [evaluation, setEvaluation] = useState<EvaluationResult>();
  const [memory, setMemory] = useState<MemoryProfile>();
  const [optimization, setOptimization] = useState<ExpressionOptimization>();
  const [reflection, setReflection] = useState<ReflectionResult>();
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [reflectionLoading, setReflectionLoading] = useState(false);

  const selectedQuestion = questions[selectedIndex];
  const selectOptions = useMemo(
    () =>
      questions.map((question, index) => ({
        value: index,
        label: `${index + 1}. ${question.question.slice(0, 42)}${question.question.length > 42 ? "..." : ""}`
      })),
    [questions]
  );

  const requestPayload = selectedQuestion
    ? {
        question: selectedQuestion.question,
        answer,
        expectedPoints: selectedQuestion.expectedPoints,
        tags: selectedQuestion.tags,
        type: selectedQuestion.type
      }
    : undefined;

  const handleFollowUp = async () => {
    if (!requestPayload) return;
    if (!answer.trim()) {
      message.warning("先写一版回答，再生成追问");
      return;
    }

    setFollowUpLoading(true);
    try {
      setFollowUpResult(await generateFollowUp({ ...requestPayload, depth: 3 }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "追问生成失败");
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!requestPayload) return;
    if (!answer.trim()) {
      message.warning("先写一版回答，再进行评分");
      return;
    }

    setEvaluationLoading(true);
    try {
      const result = await evaluateInterviewAnswer(requestPayload);
      setEvaluation(result.evaluation);
      setMemory(result.memory);
      await savePracticeRecord({
        sessionId,
        question: selectedQuestion,
        answer,
        followUps: followUpResult?.followUps ?? [],
        evaluation: result.evaluation
      });
      onSessionUpdated?.();
      message.success("评分已记录到复盘报告");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "评分失败");
    } finally {
      setEvaluationLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!selectedQuestion) return;
    if (!answer.trim()) {
      message.warning("先写一版回答，再优化表达");
      return;
    }

    setOptimizationLoading(true);
    try {
      setOptimization(
        await optimizeExpression({
          answer,
          question: selectedQuestion.question,
          expectedPoints: selectedQuestion.expectedPoints
        })
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "表达优化失败");
    } finally {
      setOptimizationLoading(false);
    }
  };

  const handleReflect = async () => {
    if (!requestPayload) return;
    if (!answer.trim()) {
      message.warning("先写一版回答，再做二次检查");
      return;
    }

    setReflectionLoading(true);
    try {
      setReflection(
        await reflectInterview({
          question: requestPayload.question,
          answer,
          followUps: followUpResult?.followUps ?? [],
          evaluation,
          expectedPoints: requestPayload.expectedPoints,
          tags: requestPayload.tags
        })
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Reflection 检查失败");
    } finally {
      setReflectionLoading(false);
    }
  };

  if (questions.length === 0 || !selectedQuestion) {
    return <Empty description="暂无可训练的问题" />;
  }

  return (
    <Row gutter={[16, 16]} className="training-grid">
      <Col xs={24} xl={9}>
        <Card className="panel-card training-card" title="当前问题">
          <Select className="question-select" value={selectedIndex} options={selectOptions} onChange={setSelectedIndex} />
          <div className="training-question">
            <Space wrap>
              {selectedQuestion.domainTags.map((domain) => (
                <Tag color="cyan" key={domain}>{domainLabel[domain]}</Tag>
              ))}
              <Tag color={selectedQuestion.difficulty === "hard" ? "red" : "orange"}>{selectedQuestion.difficulty}</Tag>
            </Space>
            <Typography.Title level={3}>{selectedQuestion.question}</Typography.Title>
          </div>
          <div className="expected-points">
            <span>回答要点</span>
            <div className="evidence-list">
              {selectedQuestion.expectedPoints.map((point) => (
                <Tag key={point}>{point}</Tag>
              ))}
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={24} xl={15}>
        <Card className="panel-card training-card" title="回答训练">
          <Input.TextArea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="写一版你的真实回答，尽量包含背景、问题、方案、结果和复盘。"
            rows={7}
          />
          <div className="answer-actions">
            <Button onClick={handleFollowUp} loading={followUpLoading}>
              生成追问
            </Button>
            <Button onClick={handleOptimize} loading={optimizationLoading}>
              优化回答
            </Button>
            <Button onClick={handleReflect} loading={reflectionLoading}>
              二次检查
            </Button>
            <Button type="primary" onClick={handleEvaluate} loading={evaluationLoading}>
              评分并记录
            </Button>
          </div>

          {optimization && (
            <div className="training-section">
              <Alert type="success" showIcon message={`回答完整度评分 ${optimization.structureScore}`} />
              <div className="optimization-box">
                <strong>优化后的回答</strong>
                <p>{optimization.optimized}</p>
                <strong>表达建议</strong>
                <div className="evidence-list">
                  {optimization.suggestions.map((item) => (
                    <Tag color="orange" key={item}>{item}</Tag>
                  ))}
                </div>
              </div>
            </div>
          )}

          {followUpResult && (
            <div className="training-section">
              <Alert type="info" showIcon message={followUpResult.summary} />
              <div className="followup-list">
                {followUpResult.followUps.map((item) => (
                  <div className="followup-item" key={item.question}>
                    <strong>{item.question}</strong>
                    <span>{item.reason}</span>
                    <Tag>{item.focus}</Tag>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reflection && (
            <div className="training-section">
              <Alert
                type={reflection.verdict === "pass" ? "success" : "warning"}
                showIcon
                message={reflection.verdict === "pass" ? "二次检查通过" : "建议修订追问/评分"}
                description={`置信度 ${reflection.confidence}`}
              />
              {reflection.issues.length > 0 && (
                <div className="feedback-grid">
                  <div>
                    <strong>发现的问题</strong>
                    <ul>
                      {reflection.issues.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>补充追问</strong>
                    <ul>
                      {reflection.revisedFollowUps.map((item) => (
                        <li key={item.question}>{item.question}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {evaluation && (
            <div className="training-section">
              <div className="evaluation-head">
                <Progress type="dashboard" percent={evaluation.score} strokeColor="#1f7a8c" />
                <div>
                  <Typography.Title level={3}>本轮评分</Typography.Title>
                  <p>重点看回答是否有分析过程、方案权衡、结果证据和方法论沉淀。</p>
                </div>
              </div>
              <div className="dimension-grid">
                {Object.entries(evaluation.dimensionScores).map(([key, value]) => (
                  <div className="dimension-item" key={key}>
                    <span>{dimensionLabel[key as keyof EvaluationResult["dimensionScores"]]}</span>
                    <Progress percent={value} showInfo={false} strokeColor="#1f7a8c" />
                  </div>
                ))}
              </div>
              <div className="feedback-grid">
                <div>
                  <strong>亮点</strong>
                  <ul>
                    {evaluation.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>继续补强</strong>
                  <ul>
                    {evaluation.weaknesses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {memory && (
                <div className="memory-strip">
                  <span>后续重点</span>
                  <div className="evidence-list">
                    {(memory.weakTags.length > 0 ? memory.weakTags : evaluation.nextPractice).slice(0, 6).map((item) => (
                      <Tag color="orange" key={item}>{item}</Tag>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}
