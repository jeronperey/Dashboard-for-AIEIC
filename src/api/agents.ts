// All API calls go through the Orchestrator — never to individual agents directly.
// See INTERFACE_CONTRACT.md for the full endpoint reference.
//
// Set VITE_ORCHESTRATOR_URL=http://localhost:8000 in .env (copy from .env.example).

const BASE = import.meta.env.VITE_ORCHESTRATOR_URL ?? '';
export const DEFAULT_LAB_ID = import.meta.env.VITE_LAB_ID ?? 'lab4';
const ACTIVE_LAB_STORAGE_KEY = 'aieic.activeLabId';

export function getActiveLabId(): string {
  try {
    return window.localStorage.getItem(ACTIVE_LAB_STORAGE_KEY) || DEFAULT_LAB_ID;
  } catch {
    return DEFAULT_LAB_ID;
  }
}

export function setActiveLabId(labId: string) {
  try {
    window.localStorage.setItem(ACTIVE_LAB_STORAGE_KEY, labId);
  } catch {
    // Storage can be unavailable in private browsing; the current view still updates.
  }
}

// ── Shared types (mirrors INTERFACE_CONTRACT.md shared schemas) ─────────────

export type StudentStatus = 'on_track' | 'needs_help' | 'flagged' | 'inactive';

export type AgentName = 'Lab Companion' | 'Participant' | 'Integrity' | 'Curriculum Designer';

export interface DashboardPayload {
  lab: {
    lab_id: string;
    title: string;
    phase: 'pre_lab' | 'during_lab' | 'post_lab';
    students_enrolled: number;
  };
  material?: {
    spec_file?: string | null;
    spec_size_mb?: number | null;
    curriculum?: CurriculumMaterial | null;
  } | null;
  activity: {
    needs_help: StudentActivityRow[];
    flagged: StudentActivityRow[];
    on_track: StudentActivityRow[];
    inactive?: StudentActivityRow[];
  };
  grades: {
    submissions_total: number;
    auto_graded: number;
    needs_review: number;
    flagged: number;
    rows: GradeRow[];
  };
  stats: {
    class_average: number;
    grade_distribution: Record<string, number>;
    ai_assistance: Record<string, string | number>;
    per_student: PerStudentStat[];
  };
}

export interface StudentActivityRow {
  student_id: string;
  total_questions: number;
  last_message: string;
  top_topic: string;
  status: StudentStatus;
}

export interface GradeRow {
  submission_id: string;
  student_id: string;
  automated_score: number;
  final_score: number | null;
  status: 'completed' | 'needs_review' | 'flagged';
  feedback_summary: string;
}

export interface PerStudentStat {
  student_id: string;
  score: number;
  question_count: number;
  hint_count: number;
  status: StudentStatus;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: string;
  expected_answer?: string | null;
  rubric_points: number;
  choices?: string[] | null;
}

export interface RubricCriterion {
  name: string;
  weight: number;
  description: string;
}

export interface Rubric {
  code_weight: number;
  report_weight: number;
  manual_weight: number;
  criteria: RubricCriterion[];
}

export interface CurriculumMaterial {
  lab_id: string;
  course_id: string;
  title: string;
  spec_markdown: string;
  quiz: QuizQuestion[];
  rubric: Rubric;
  learning_objectives: string[];
  difficulty: 'basic' | 'intermediate' | 'challenge';
  estimated_duration_min: number;
  approval_status: 'pending' | 'approved' | 'needs_changes';
  approved_by?: string | null;
  version: number;
  generated_at: string;
  last_updated: string;
}

export interface GenerateMaterialInput {
  lab_id?: string;
  course_id?: string;
  title?: string;
  learning_objectives?: string[];
  difficulty?: 'basic' | 'intermediate' | 'challenge';
  estimated_duration_min?: number;
  instructor_id?: string;
  agent_instructions?: string;
}

// Per-student integrity analytics — from GET /analytics/lab/{lab_id} via Orchestrator
export interface StudentIntegrityData {
  student_id: string;
  question_count: number;
  violation_count: number;
  status: 'ON_TRACK' | 'FLAGGED' | 'NEEDS_HELP';
  classification_breakdown: Record<string, number>;
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function postForm<T>(path: string, form: FormData): Promise<T | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export async function fetchDashboard(
  tab?: 'material' | 'activity' | 'grades' | 'stats',
  labId = getActiveLabId(),
): Promise<DashboardPayload | null> {
  const query = tab ? `?tab=${tab}` : '';
  return get<DashboardPayload>(`/orchestrator/instructor/dashboard/${labId}${query}`);
}

// ── Curriculum material ─────────────────────────────────────────────────────

export async function fetchMaterial(labId = getActiveLabId()): Promise<CurriculumMaterial | null> {
  const material = await get<CurriculumMaterial>(`/orchestrator/instructor/material/${labId}`);
  if (material) return material;
  const dashboard = await fetchDashboard('material', labId);
  return dashboard?.material?.curriculum ?? null;
}

export async function generateMaterial(input: GenerateMaterialInput = {}): Promise<CurriculumMaterial | null> {
  const material = await postJson<CurriculumMaterial>('/orchestrator/instructor/material/generate-quiz', {
    course_id: input.course_id ?? 'csc580',
    lab_id: input.lab_id ?? getActiveLabId(),
    title: input.title ?? 'Linked Lists',
    learning_objectives: input.learning_objectives ?? [
      'Explain linked-list node structure and pointer references.',
      'Implement insertion and deletion operations for singly linked lists.',
      'Analyze edge cases such as deleting the head node.',
    ],
    difficulty: input.difficulty ?? 'intermediate',
    estimated_duration_min: input.estimated_duration_min ?? 90,
    instructor_id: input.instructor_id ?? 'instructor',
  });
  if (material) setActiveLabId(material.lab_id);
  return material;
}

export async function generateMaterialWithUpload(
  input: GenerateMaterialInput,
  file?: File | null,
): Promise<CurriculumMaterial | null> {
  const form = new FormData();
  form.append('course_id', input.course_id ?? 'csc580');
  form.append('lab_id', input.lab_id ?? getActiveLabId());
  form.append('title', input.title ?? 'Linked Lists');
  form.append('learning_objectives', JSON.stringify(input.learning_objectives ?? []));
  form.append('difficulty', input.difficulty ?? 'intermediate');
  form.append('estimated_duration_min', String(input.estimated_duration_min ?? 90));
  form.append('instructor_id', input.instructor_id ?? 'instructor');
  form.append('agent_instructions', input.agent_instructions ?? '');
  if (file) form.append('file', file);

  const material = await postForm<CurriculumMaterial>(
    '/orchestrator/instructor/material/generate-with-material',
    form,
  );
  if (material) setActiveLabId(material.lab_id);
  return material;
}

export async function approveMaterial(labId = getActiveLabId(), approvedBy = 'instructor'): Promise<CurriculumMaterial | null> {
  return postJson<CurriculumMaterial>('/orchestrator/instructor/material/approve', {
    lab_id: labId,
    approved_by: approvedBy,
    notes: '',
  });
}

export async function requestMaterialChanges(
  feedback: string,
  labId = getActiveLabId(),
  requestedBy = 'instructor',
): Promise<CurriculumMaterial | null> {
  return postJson<CurriculumMaterial>('/orchestrator/instructor/material/request-changes', {
    lab_id: labId,
    feedback,
    requested_by: requestedBy,
  });
}

export async function uploadMaterial(file: File, labId = getActiveLabId()): Promise<{ status: string; file_count: number } | null> {
  const form = new FormData();
  form.append('lab_id', labId);
  form.append('file', file);
  return postForm<{ status: string; file_count: number }>('/orchestrator/instructor/material/upload', form);
}

export async function uploadAgentInstructions(
  instructions: string,
  labId = getActiveLabId(),
): Promise<{ lab_id: string; field: string; chars_stored: number; message: string } | null> {
  return postJson('/orchestrator/instructor/material/upload-instructions', {
    lab_id: labId,
    instructions,
  });
}

// ── Student Activity (polls every 10s per contract — v0.1) ──────────────────

export async function fetchActivityTab() {
  const data = await fetchDashboard('activity');
  return data?.activity ?? null;
}

// ── Integrity analytics (feeds per-student integrity data) ──────────────────

export interface IntegrityAnalytics {
  lab_id: string;
  question_stats: {
    total_questions: number;
    avg_questions_per_student: number;
    direct_solution_attempts: number;
    escalated_session_count: number;
  };
  per_student: StudentIntegrityData[];
}

export async function fetchIntegrityAnalytics(): Promise<IntegrityAnalytics | null> {
  return get<IntegrityAnalytics>(`/orchestrator/integrity/analytics/lab/${getActiveLabId()}`);
}

// ── Submission detail ────────────────────────────────────────────────────────

export async function fetchSubmission(submissionId: string) {
  return get(`/orchestrator/instructor/submission/${submissionId}`);
}

// ── Grading actions ──────────────────────────────────────────────────────────

export async function triggerGradeBatch(): Promise<{ submissions_queued: number } | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/orchestrator/instructor/grade-batch?lab_id=${getActiveLabId()}`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function exportMaterialMarkdown(material: CurriculumMaterial) {
  const quiz = material.quiz
    .map((q, index) => [
      `### Q${index + 1}. ${q.question}`,
      '',
      `Type: ${q.type}`,
      `Points: ${q.rubric_points}`,
      q.choices?.length ? `Choices:\n${q.choices.map(choice => `- ${choice}`).join('\n')}` : '',
      q.expected_answer ? `Expected answer: ${q.expected_answer}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  const rubric = [
    `Code weight: ${material.rubric.code_weight}`,
    `Report weight: ${material.rubric.report_weight}`,
    `Manual weight: ${material.rubric.manual_weight}`,
    '',
    ...material.rubric.criteria.map(
      criterion => `- ${criterion.name} (${criterion.weight}): ${criterion.description}`,
    ),
  ].join('\n');

  const body = [
    `# ${material.title}`,
    '',
    `Lab ID: ${material.lab_id}`,
    `Course ID: ${material.course_id}`,
    `Version: v${material.version}`,
    `Status: ${material.approval_status}`,
    '',
    '## Spec',
    material.spec_markdown,
    '',
    '## Quiz',
    quiz || '_No quiz questions._',
    '',
    '## Rubric',
    rubric,
  ].join('\n');

  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${material.lab_id}-curriculum-v${material.version}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
