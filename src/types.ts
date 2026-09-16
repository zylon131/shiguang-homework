export type User = {
  id: string;
  name: string;
  role: "admin" | "teacher";
  orgId: string;
  orgName: string;
  demo: boolean;
};
export type Job = {
  id: string;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
};
export type Student = {
  id: string;
  name: string;
  grade: number;
  class_name: string;
  teacher_id: string;
  teacher_name: string;
  pending: number;
  wrong: number;
  status: string;
  jobs: Job[];
};
export type Dashboard = {
  students: Student[];
  date: string;
  week: { start: string; end: string };
  stats: {
    total: number;
    submitted: number;
    pending: number;
    pages: number;
    questions: number;
    wrong: number;
  };
  model: { configured: boolean; name: string };
};
export type Exercise = {
  text: string;
  answer: string;
  explanation: string;
  difficulty: string;
};
export type Question = {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  grade: number;
  number: string;
  text: string;
  student_answer: string;
  correct_answer: string;
  explanation: string;
  knowledge: string;
  ai_verdict: string;
  confidence: number;
  status: string;
  mastered: number;
  imageUrl: string | null;
  practice: Exercise[];
  practice_status: string | null;
  practice_error: string | null;
  created_at: string;
};
export type ReportContent = {
  studentName: string;
  grade: number;
  className: string;
  weekStart: string;
  weekEnd: string;
  days: number;
  total: number;
  correct: number;
  wrong: number;
  pending: number;
  accuracy: number | null;
  subjects: {
    subject: string;
    total: number;
    correct: number;
    wrong: number;
    pending: number;
    accuracy: number | null;
  }[];
  knowledge: { name: string; count: number }[];
  exercises: { knowledge: string; subject: string; items: Exercise[] }[];
  practicePending?: number;
  practiceOmitted?: number;
  unclassified?: number;
  mastered: number;
  summary: string;
  teacherNote: string;
  generatedAt: string;
};
export type Report = {
  id: string;
  student_id: string;
  student_name: string;
  week_start: string;
  week_end: string;
  shared: boolean;
  expires_at: string | null;
  content: ReportContent;
};
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  student_count: number;
};
