import { create } from "zustand";
import type {
  ExperienceAnalysis,
  InterviewPlan,
  InterviewQuestion,
  InterviewReport,
  InterviewSession,
  ProfileAnalysis
} from "../shared/types";

type ProfileSource = "llm";

type SessionState = {
  currentSession?: InterviewSession;
  profileAnalysis?: ProfileAnalysis;
  experienceAnalysis?: ExperienceAnalysis;
  interviewPlan?: InterviewPlan;
  initialQuestions?: InterviewQuestion[];
  report?: InterviewReport;
  profileSource?: ProfileSource;
  profileWarning?: string;
  setCurrentSession: (session: InterviewSession) => void;
  setProfileResult: (result: { analysis: ProfileAnalysis; source: ProfileSource; warning?: string }) => void;
  setExperienceResult: (result: { analysis: ExperienceAnalysis }) => void;
  setPlannerResult: (result: { plan: InterviewPlan; questions: InterviewQuestion[] }) => void;
  setReportResult: (result: { report: InterviewReport; session: InterviewSession }) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  setCurrentSession: (session) =>
    set({
      currentSession: session,
      profileAnalysis: session.profileAnalysis,
      experienceAnalysis: session.experienceAnalysis,
      interviewPlan: session.interviewPlan,
      initialQuestions: session.initialQuestions,
      report: session.report
    }),
  setProfileResult: (result) =>
    set({
      profileAnalysis: result.analysis,
      profileSource: result.source,
      profileWarning: result.warning
    }),
  setExperienceResult: (result) =>
    set({
      experienceAnalysis: result.analysis
    }),
  setPlannerResult: (result) =>
    set({
      interviewPlan: result.plan,
      initialQuestions: result.questions
    }),
  setReportResult: (result) =>
    set({
      currentSession: result.session,
      profileAnalysis: result.session.profileAnalysis,
      experienceAnalysis: result.session.experienceAnalysis,
      interviewPlan: result.session.interviewPlan,
      initialQuestions: result.session.initialQuestions,
      report: result.report
    })
}));
