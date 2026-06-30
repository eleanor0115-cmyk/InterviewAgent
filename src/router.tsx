import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
import { InputPage } from "./pages/InputPage";
import { PlanPage } from "./pages/PlanPage";
import { ReportPage } from "./pages/ReportPage";
import { ExperienceLibraryPage } from "./pages/ExperienceLibraryPage";
import { KnowledgeTreePage } from "./pages/KnowledgeTreePage";
import { ModelConfigPage } from "./pages/ModelConfigPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <InputPage /> },
      { path: "sessions/:sessionId/plan", element: <PlanPage /> },
      { path: "sessions/:sessionId/library", element: <ExperienceLibraryPage /> },
      { path: "sessions/:sessionId/knowledge", element: <KnowledgeTreePage /> },
      { path: "sessions/:sessionId/report", element: <ReportPage /> },
      { path: "config/model", element: <ModelConfigPage /> },
      { path: "*", element: <Navigate to="/" replace /> }
    ]
  }
]);
