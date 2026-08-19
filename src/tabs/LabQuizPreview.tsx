import { useEffect, useState } from 'react';
import {
  approveMaterial,
  exportMaterialMarkdown,
  fetchMaterial,
  generateMaterial,
  requestMaterialChanges,
  type CurriculumMaterial,
} from '../api/agents';

function statusLabel(status: CurriculumMaterial['approval_status']) {
  if (status === 'approved') return 'Approved';
  if (status === 'needs_changes') return 'Needs changes';
  return 'Pending approval';
}

export default function LabQuizPreview() {
  const [material, setMaterial] = useState<CurriculumMaterial | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const data = await fetchMaterial();
    setMaterial(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    function refresh() {
      void load();
    }
    window.addEventListener('curriculum:changed', refresh);
    return () => window.removeEventListener('curriculum:changed', refresh);
  }, []);

  async function handleGenerate() {
    setWorking(true);
    setError(null);
    const data = await generateMaterial(material ? {
      lab_id: material.lab_id,
      course_id: material.course_id,
      title: material.title,
      learning_objectives: material.learning_objectives,
      difficulty: material.difficulty,
      estimated_duration_min: material.estimated_duration_min,
    } : undefined);
    if (data) {
      setMaterial(data);
      window.dispatchEvent(new CustomEvent('curriculum:changed'));
    } else {
      setError('Could not generate quiz. Check that the backend services are running.');
    }
    setWorking(false);
  }

  async function handleApprove() {
    if (!material) return;
    setWorking(true);
    setError(null);
    const data = await approveMaterial(material.lab_id);
    if (data) {
      setMaterial(data);
      window.dispatchEvent(new CustomEvent('curriculum:changed'));
    } else {
      setError('Could not approve quiz material.');
    }
    setWorking(false);
  }

  async function handleRequestChanges() {
    const feedback = prompt.trim();
    if (!feedback || !material) return;
    setWorking(true);
    setError(null);
    const data = await requestMaterialChanges(feedback, material.lab_id);
    if (data) {
      setMaterial(data);
      setPrompt('');
      window.dispatchEvent(new CustomEvent('curriculum:changed'));
    } else {
      setError('Could not request quiz changes.');
    }
    setWorking(false);
  }

  const approved = material?.approval_status === 'approved';

  return (
    <div className="content-card">
      <div className="content-header">
        <div className="content-title">
          <h2>{material ? `${material.lab_id} - ${material.title} Quiz` : 'Lab Quiz'}</h2>
          <p>
            {material
              ? `${material.quiz.length} questions · Version ${material.version} · ${statusLabel(material.approval_status)}`
              : 'No generated quiz loaded'}
          </p>
        </div>
        <div className="content-actions">
          <button className="btn-outline" onClick={handleGenerate} disabled={working}>
            {working ? 'Generating...' : material ? 'Regenerate Quiz' : 'Generate Quiz'}
          </button>
          <button className="btn-outline" onClick={() => material && exportMaterialMarkdown(material)} disabled={!material}>
            Export
          </button>
          <div className="content-actions-divider" />
          <button className="btn-approve" onClick={handleApprove} disabled={!material || approved || working}>
            {approved ? 'Approved' : 'Approve'}
          </button>
        </div>
      </div>

      <hr className="content-divider" />

      {loading && <div className="empty-state">Loading quiz material...</div>}

      {!loading && error && <div className="error-state">{error}</div>}

      {!loading && !material && (
        <div className="empty-state">
          No generated quiz yet. Generate curriculum material to create the quiz and rubric.
        </div>
      )}

      {!loading && material && material.quiz.map((q, i) => (
        <div key={q.id || i} className="question-item quiz-question-item">
          <div className="quiz-question-header">
            <span>Q{i + 1}. {q.question}</span>
            <span>{q.type} · {q.rubric_points} pts</span>
          </div>
          {q.choices && q.choices.length > 0 && (
            <ul className="quiz-choice-list">
              {q.choices.map(choice => <li key={choice}>{choice}</li>)}
            </ul>
          )}
          {q.expected_answer && (
            <div className="quiz-answer">Expected answer: {q.expected_answer}</div>
          )}
        </div>
      ))}

      <div className="prompt-input-bar">
        <input
          type="text"
          placeholder='Ask the agent to refine this quiz...  e.g. "Add a multiple-choice question about traversal"'
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={!material || working}
        />
        <button className="btn-send" onClick={handleRequestChanges} disabled={!material || !prompt.trim() || working}>
          Send
        </button>
      </div>
    </div>
  );
}
