import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Empty, Form, Input, InputNumber, List, Select, Skeleton, Space, Tag, Typography, message } from "antd";
import { PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { getSession, updateExperienceQuestions } from "../api/client";
import { useSessionStore } from "../store/sessionStore";
import type { ExperienceQuestion, InterviewSession, JobDomain } from "../shared/types";

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

const domainOptions = Object.entries(domainLabel).map(([value, label]) => ({ value, label }));
const difficultyOptions = [
  { value: "easy", label: "easy" },
  { value: "medium", label: "medium" },
  { value: "hard", label: "hard" }
];

function createBlankQuestion(): ExperienceQuestion {
  return {
    question: "请输入面经问题",
    type: "experience_validation",
    domainTags: ["general"],
    tags: ["手动补充"],
    difficulty: "medium",
    frequency: 1,
    source: "用户搜集面经"
  };
}

export function ExperienceLibraryPage() {
  const { sessionId } = useParams();
  const [form] = Form.useForm<{ questions: ExperienceQuestion[] }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const currentSession = useSessionStore((state) => state.currentSession);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) return;

      setLoading(true);
      try {
        const session = await getSession(sessionId);
        setCurrentSession(session);
        form.setFieldsValue({ questions: session.experienceAnalysis?.questions ?? [] });
      } catch (error) {
        message.error(error instanceof Error ? error.message : "读取面经库失败");
      } finally {
        setLoading(false);
      }
    }

    if (!currentSession || currentSession.id !== sessionId) {
      void loadSession();
    } else {
      form.setFieldsValue({ questions: currentSession.experienceAnalysis?.questions ?? [] });
      setLoading(false);
    }
  }, [currentSession, form, sessionId, setCurrentSession]);

  const session = currentSession as InterviewSession | undefined;
  const watchedQuestions = Form.useWatch("questions", form) ?? [];
  const allTags = useMemo(() => {
    return [...new Set(watchedQuestions.flatMap((question) => question.tags))].filter(Boolean);
  }, [watchedQuestions]);
  const filteredIndexSet = useMemo(() => {
    return new Set(
      watchedQuestions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => tagFilter === "all" || question.tags.includes(tagFilter))
        .map(({ index }) => index)
    );
  }, [tagFilter, watchedQuestions]);

  const handleSave = async () => {
    if (!session) return;

    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await updateExperienceQuestions({ sessionId: session.id, questions: values.questions ?? [] });
      setCurrentSession(result.session);
      form.setFieldsValue({ questions: result.analysis.questions });
      message.success("面经库已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!session) return <Empty description="未找到这份准备记录" />;

  return (
    <section className="analysis-page">
      <div className="analysis-heading">
        <div>
          <Typography.Title level={1}>搜集面经</Typography.Title>
          <Typography.Paragraph>
            {session.company} · {session.jobTitle}，管理你搜集到的真实面经题，Agent 只负责解析、打标签和排序。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving}>
            保存修改
          </Button>
        </Space>
      </div>

      <Card className="panel-card library-toolbar">
        <Space wrap>
          <Select
            value={tagFilter}
            options={[{ value: "all", label: "全部标签" }, ...allTags.map((tag) => ({ value: tag, label: tag }))]}
            onChange={setTagFilter}
            className="library-filter"
          />
          <Tag color="cyan">共 {watchedQuestions.length} 题</Tag>
        </Space>
      </Card>

      <Form form={form} layout="vertical" initialValues={{ questions: session.experienceAnalysis?.questions ?? [] }}>
        <Form.List name="questions">
          {(fields, { add, remove }) => (
            <div className="library-list">
              {fields.length === 0 && (
                <Empty description="暂无面经题目">
                  <Button icon={<PlusOutlined />} onClick={() => add(createBlankQuestion())}>
                    新增题目
                  </Button>
                </Empty>
              )}
              {fields
                .filter((field) => filteredIndexSet.has(field.name))
                .map((field) => (
                  <Card
                    className="panel-card library-question-card"
                    key={field.key}
                    title={`题目 ${field.name + 1}`}
                    extra={
                      <Button danger type="link" onClick={() => remove(field.name)}>
                        删除
                      </Button>
                    }
                  >
                    <Form.Item
                      name={[field.name, "question"]}
                      label="问题"
                      rules={[{ required: true, message: "请输入问题" }]}
                    >
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <div className="library-meta-grid">
                      <Form.Item name={[field.name, "type"]} hidden initialValue="experience_validation">
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, "difficulty"]} label="难度" rules={[{ required: true }]}>
                        <Select options={difficultyOptions} />
                      </Form.Item>
                      <Form.Item name={[field.name, "frequency"]} label="频次" rules={[{ required: true }]}>
                        <InputNumber min={1} max={99} />
                      </Form.Item>
                    </div>
                    <div className="library-meta-grid two">
                      <Form.Item name={[field.name, "domainTags"]} label="岗位域">
                        <Select mode="multiple" options={domainOptions} />
                      </Form.Item>
                      <Form.Item name={[field.name, "tags"]} label="标签">
                        <Select mode="tags" tokenSeparators={[",", "，", "、"]} />
                      </Form.Item>
                    </div>
                    <Form.Item name={[field.name, "source"]} label="来源">
                      <Input />
                    </Form.Item>
                  </Card>
                ))}
              {fields.length > 0 && (
                <Button className="library-add-button" icon={<PlusOutlined />} onClick={() => add(createBlankQuestion())}>
                  新增题目
                </Button>
              )}
            </div>
          )}
        </Form.List>
      </Form>

      {session.experienceAnalysis && (
        <div className="section-row">
          <Card className="panel-card" title="高频标签预览">
            <List
              dataSource={session.experienceAnalysis.hotTags}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    <Tag color="cyan">{item.name}</Tag>
                    <span>×{item.count}</span>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </div>
      )}
    </section>
  );
}
