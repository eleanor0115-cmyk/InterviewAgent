import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Checkbox, Form, Input, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadProps } from "antd";
import { ClearOutlined, DeleteOutlined, DownloadOutlined, FileTextOutlined, RocketOutlined, SaveOutlined } from "@ant-design/icons";
import type { CreateSessionInput, JobDomain, ParsedResume } from "../shared/types";
import { analyzeExperience, analyzeProfile, createPlan, createSession, parseResumeFile } from "../api/client";
import { useSessionStore } from "../store/sessionStore";

const jobDomainOptions: { label: string; value: JobDomain }[] = [
  { label: "前端", value: "frontend" },
  { label: "后端", value: "backend" },
  { label: "AI 工程", value: "ai_engineering" },
  { label: "产品", value: "product" },
  { label: "运营", value: "operations" },
  { label: "数据分析", value: "data_analysis" },
  { label: "市场", value: "marketing" },
  { label: "商业", value: "business" },
  { label: "通用", value: "general" }
];

const initialValues: CreateSessionInput = {
  company: "",
  jobTitle: "",
  jdText: "",
  resumeText: "",
  experienceText: "",
  questionTypes: [],
  jobDomains: []
};

const resumeCacheKey = "interview-agent.resumeText";
const inputDraftCacheKey = "interview-agent.inputDraft";

function readResumeCache() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(resumeCacheKey) ?? "";
}

function writeResumeCache(value: string) {
  if (typeof window === "undefined") return;
  const normalized = value.trim();
  if (normalized) {
    window.localStorage.setItem(resumeCacheKey, normalized);
  }
}

function clearResumeCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(resumeCacheKey);
}

function readInputDraft(): Partial<CreateSessionInput> | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(inputDraftCacheKey);
    return raw ? (JSON.parse(raw) as Partial<CreateSessionInput>) : undefined;
  } catch {
    return undefined;
  }
}

function writeInputDraft(value: Partial<CreateSessionInput>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(inputDraftCacheKey, JSON.stringify(value));
}

function clearInputDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(inputDraftCacheKey);
}

export function InputPage() {
  const [form] = Form.useForm<CreateSessionInput>();
  const [submitting, setSubmitting] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [hasResumeCache, setHasResumeCache] = useState(false);
  const [parsedResume, setParsedResume] = useState<ParsedResume>();
  const navigate = useNavigate();
  const currentSession = useSessionStore((state) => state.currentSession);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const setProfileResult = useSessionStore((state) => state.setProfileResult);
  const setExperienceResult = useSessionStore((state) => state.setExperienceResult);
  const setPlannerResult = useSessionStore((state) => state.setPlannerResult);

  useEffect(() => {
    const cachedResume = readResumeCache();
    const cachedDraft = readInputDraft();
    setHasResumeCache(Boolean(cachedResume));

    if (cachedDraft) {
      form.setFieldsValue({
        ...initialValues,
        ...cachedDraft,
        resumeText: cachedDraft.resumeText ?? cachedResume
      });
      return;
    }

    if (currentSession) {
      form.setFieldsValue({
        company: currentSession.company,
        jobTitle: currentSession.jobTitle,
        jdText: currentSession.jdText,
        resumeText: currentSession.resumeText || cachedResume || "",
        experienceText: currentSession.experienceText,
        questionTypes: currentSession.questionTypes,
        jobDomains: currentSession.jobDomains
      });
      return;
    }

    if (cachedResume && !form.getFieldValue("resumeText")) {
      form.setFieldValue("resumeText", cachedResume);
    }
  }, [currentSession, form]);

  const handleValuesChange = (_changed: Partial<CreateSessionInput>, values: CreateSessionInput) => {
    writeInputDraft(values);
  };

  const handleLoadResumeCache = () => {
    const cachedResume = readResumeCache();
    if (!cachedResume) {
      message.warning("暂无缓存简历");
      setHasResumeCache(false);
      return;
    }

    form.setFieldValue("resumeText", cachedResume);
    setHasResumeCache(true);
    message.success("已加载缓存简历");
  };

  const handleSaveResumeCache = () => {
    const resumeText = form.getFieldValue("resumeText")?.trim() ?? "";
    if (resumeText.length < 20) {
      message.warning("简历内容至少 20 个字符后再保存");
      return;
    }

    writeResumeCache(resumeText);
    setHasResumeCache(true);
    message.success("简历已保存到本地缓存");
  };

  const handleClearResumeCache = () => {
    clearResumeCache();
    setHasResumeCache(false);
    message.success("已清空简历缓存");
  };

  const handleResumeUpload: UploadProps["beforeUpload"] = async (file) => {
    setResumeParsing(true);
    try {
      const parsed = await parseResumeFile(file);
      const resumeText = parsed.formattedText || parsed.rawText;

      form.setFieldValue("resumeText", resumeText);
      writeResumeCache(resumeText);
      writeInputDraft({ ...form.getFieldsValue(), resumeText });
      setHasResumeCache(true);
      setParsedResume(parsed);
      message.success(`已解析 ${parsed.fileName}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "简历解析失败");
    } finally {
      setResumeParsing(false);
    }

    return Upload.LIST_IGNORE;
  };

  const handleClearDraft = () => {
    writeInputDraft(initialValues);
    form.setFieldsValue(initialValues);
    message.success("已清空当前资料草稿");
  };

  const handleSubmit = async (values: CreateSessionInput) => {
    setSubmitting(true);

    try {
      const payload: CreateSessionInput = {
        ...values,
        questionTypes: values.questionTypes ?? []
      };

      writeResumeCache(payload.resumeText);
      writeInputDraft(payload);
      setHasResumeCache(Boolean(payload.resumeText.trim()));

      const session = await createSession(payload);
      setCurrentSession(session);

      const profileResult = await analyzeProfile({
        sessionId: session.id,
        company: payload.company,
        jobTitle: payload.jobTitle,
        jdText: payload.jdText,
        resumeText: payload.resumeText
      });
      setProfileResult(profileResult);

      const experienceResult = await analyzeExperience({
        sessionId: session.id,
        company: payload.company,
        jobTitle: payload.jobTitle,
        experienceText: payload.experienceText,
        jdText: payload.jdText,
        resumeText: payload.resumeText
      });
      setExperienceResult(experienceResult);

      const plannerResult = await createPlan({ sessionId: session.id });
      setPlannerResult(plannerResult);

      message.success("面试准备方案已生成");
      navigate(`/sessions/${session.id}/plan`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page-grid input-page">
      <div className="page-intro">
        <Typography.Title level={1}>资料输入</Typography.Title>
        <Typography.Paragraph>
          输入目标公司、岗位 JD、简历和搜集面经，生成一份可训练的面试准备方案。
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          message="模型配置"
          description="使用已配置的模型服务生成分析；模型请求失败时会直接提示错误。"
        />
      </div>

      <Form
        form={form}
        className="input-form"
        layout="vertical"
        initialValues={initialValues}
        onValuesChange={handleValuesChange}
        onFinish={handleSubmit}
      >
        <div className="form-row">
          <Form.Item name="company" label="公司名称" rules={[{ required: true, message: "请输入公司名称" }]}>
            <Input placeholder="例如：字节跳动" />
          </Form.Item>
          <Form.Item name="jobTitle" label="岗位名称" rules={[{ required: true, message: "请输入岗位名称" }]}>
            <Input placeholder="例如：AI 应用前端工程师" />
          </Form.Item>
        </div>

        <Form.Item name="jobDomains" label="岗位域标签" rules={[{ required: true, message: "至少选择一个岗位域标签" }]}>
          <Checkbox.Group
            options={jobDomainOptions}
            onChange={(values) => form.setFieldValue("jobDomains", values as JobDomain[])}
          />
        </Form.Item>

        <Form.Item name="jdText" label="岗位 JD" rules={[{ required: true, min: 20, message: "请粘贴至少 20 个字符的 JD" }]}>
          <Input.TextArea rows={7} placeholder="粘贴岗位职责、任职要求、加分项..." />
        </Form.Item>

        <Form.Item
          name="resumeText"
          className="resume-form-item"
          label={
            <div className="field-label-actions">
              <span>候选人简历</span>
              <Space size={6}>
                <Button
                  htmlType="button"
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  disabled={!hasResumeCache}
                  onClick={handleLoadResumeCache}
                >
                  加载缓存
                </Button>
                <Button htmlType="button" type="link" size="small" icon={<SaveOutlined />} onClick={handleSaveResumeCache}>
                  保存缓存
                </Button>
                <Button
                  htmlType="button"
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={!hasResumeCache}
                  onClick={handleClearResumeCache}
                >
                  清空
                </Button>
                <Upload
                  accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={handleResumeUpload}
                >
                  <Button htmlType="button" type="link" size="small" icon={<FileTextOutlined />} loading={resumeParsing}>
                    上传解析
                  </Button>
                </Upload>
              </Space>
            </div>
          }
          rules={[{ required: true, min: 20, message: "请粘贴至少 20 个字符的简历内容" }]}
        >
          <Input.TextArea rows={7} placeholder="粘贴项目经历、技能栈、实习经历、成果指标..." />
        </Form.Item>

        {parsedResume && (
          <div className="parsed-resume-summary">
            <div className="parsed-resume-title">
              <strong>解析结果</strong>
              <span>{parsedResume.fileName}</span>
            </div>
            <div className="evidence-list">
              {parsedResume.fields.name && <Tag color="blue">姓名：{parsedResume.fields.name}</Tag>}
              {parsedResume.fields.email && <Tag color="cyan">邮箱：{parsedResume.fields.email}</Tag>}
              {parsedResume.fields.phone && <Tag color="cyan">手机：{parsedResume.fields.phone}</Tag>}
              {parsedResume.fields.education.length > 0 && <Tag>教育 {parsedResume.fields.education.length}</Tag>}
              {parsedResume.fields.skills.length > 0 && <Tag>技能 {parsedResume.fields.skills.length}</Tag>}
              {parsedResume.fields.projects.length > 0 && <Tag>项目 {parsedResume.fields.projects.length}</Tag>}
              {parsedResume.fields.internships.length > 0 && <Tag>实习 {parsedResume.fields.internships.length}</Tag>}
              {parsedResume.fields.workExperience.length > 0 && <Tag>工作 {parsedResume.fields.workExperience.length}</Tag>}
            </div>
          </div>
        )}

        <Form.Item name="experienceText" label="面经材料">
          <Input.TextArea rows={7} placeholder="粘贴目标公司或同类岗位面经，模型会提取高频问题和准备重点..." />
        </Form.Item>

        <Space className="form-actions">
          <Button icon={<ClearOutlined />} onClick={handleClearDraft} disabled={submitting}>
            清空资料
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => form.submit()} loading={submitting}>
            保存资料
          </Button>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => form.submit()} loading={submitting}>
            生成准备方案
          </Button>
        </Space>
      </Form>
    </section>
  );
}
