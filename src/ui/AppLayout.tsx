import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Steps } from "antd";
import {
  BarChartOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  RadarChartOutlined,
  SettingOutlined,
  ShareAltOutlined
} from "@ant-design/icons";
import { useSessionStore } from "../store/sessionStore";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentSession = useSessionStore((state) => state.currentSession);
  const sessionId = currentSession?.id ?? location.pathname.match(/sessions\/([^/]+)/)?.[1];
  let current = 0;
  if (location.pathname.includes("/plan")) current = 1;
  if (location.pathname.includes("/library")) current = 2;
  if (location.pathname.includes("/knowledge")) current = 3;
  if (location.pathname.includes("/report")) current = 4;
  if (location.pathname.includes("/config")) current = 5;

  const steps = [
    { title: "资料输入", icon: <FileTextOutlined />, path: "/" },
    { title: "准备方案", icon: <RadarChartOutlined />, path: sessionId ? `/sessions/${sessionId}/plan` : undefined },
    { title: "搜集面经", icon: <DatabaseOutlined />, path: sessionId ? `/sessions/${sessionId}/library` : undefined },
    { title: "知识树", icon: <ShareAltOutlined />, path: sessionId ? `/sessions/${sessionId}/knowledge` : undefined },
    { title: "复盘报告", icon: <BarChartOutlined />, path: sessionId ? `/sessions/${sessionId}/report` : undefined },
    { title: "模型配置", icon: <SettingOutlined />, path: "/config/model" }
  ];
  const stepItems = steps.map((step, index) => {
    const path = step.path;

    return {
      title: step.title,
      icon: step.icon,
      disabled: index > 0 && !path,
      onClick: path ? () => navigate(path) : undefined
    };
  });

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <button className="brand" type="button" onClick={() => navigate("/")}>
          <strong>InterviewAgent</strong>
        </button>
      </Layout.Header>
      <Layout.Content className="app-content">
        <aside className="step-rail">
          <Steps direction="vertical" current={current} items={stepItems} />
        </aside>
        <main className="main-panel">
          <Outlet />
        </main>
      </Layout.Content>
    </Layout>
  );
}
