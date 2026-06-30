import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Skeleton, Space, Tag, Typography, message } from "antd";
import { SaveOutlined, SyncOutlined } from "@ant-design/icons";
import { getModelConfig, updateModelConfig } from "../api/client";
import type { ModelConfigInfo, ModelConfigUpdate } from "../shared/types";

export function ModelConfigPage() {
  const [form] = Form.useForm<ModelConfigUpdate>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ModelConfigInfo>();

  const loadConfig = async () => {
    setLoading(true);
    try {
      const result = await getModelConfig();
      setConfig(result);
      form.setFieldsValue({
        apiKey: "",
        baseUrl: result.baseUrl,
        model: result.model
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取模型配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSave = async (values: ModelConfigUpdate) => {
    setSaving(true);
    try {
      const result = await updateModelConfig(values);
      setConfig(result);
      form.setFieldValue("apiKey", "");
      message.success("模型配置已保存，后续请求会直接使用新配置");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存模型配置失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;

  return (
    <section className="analysis-page">
      <div className="analysis-heading">
        <div>
          <Typography.Title level={1}>模型配置</Typography.Title>
          <Typography.Paragraph>配置 OpenAI-compatible 模型服务，保存后无需重启后端。</Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<SyncOutlined />} onClick={loadConfig} disabled={saving}>
            刷新
          </Button>
        </Space>
      </div>

      <Alert
        className="stacked-alert"
        type={config?.configured ? "success" : "warning"}
        showIcon
        message={config?.configured ? "模型已配置" : "模型未配置"}
        description={`当前 Provider：${config?.providerHint ?? "-"}；Key：${config?.apiKeyMasked || "未配置"}；来源：${
          config?.source === "local_file" ? "页面保存" : "环境变量"
        }`}
      />

      <Card className="panel-card model-config-card">
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="apiKey"
            label={
              <Space>
                <span>API Key</span>
                <Tag>{config?.apiKeyMasked || "未配置"}</Tag>
              </Space>
            }
            extra="留空表示继续使用当前 Key；填写新 Key 后会保存到本地配置文件。"
          >
            <Input.Password placeholder="sk-..." autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: "请输入 Base URL" }, { type: "url", message: "请输入合法 URL" }]}
          >
            <Input placeholder="https://api.deepseek.com/v1" />
          </Form.Item>

          <Form.Item name="model" label="Model" rules={[{ required: true, message: "请输入模型名称" }]}>
            <Input placeholder="deepseek-chat" />
          </Form.Item>

          <Space className="form-actions">
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
              保存配置
            </Button>
          </Space>
        </Form>
      </Card>
    </section>
  );
}
