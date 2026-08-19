import { useRef, useState } from 'react';
import { generateMaterialWithUpload, getActiveLabId, type GenerateMaterialInput } from '../api/agents';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

export default function UploadMaterialModal({ onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [labId, setLabId] = useState(getActiveLabId());
  const [instructorId, setInstructorId] = useState('prof_demo');
  const [title, setTitle] = useState('Introduction to Linked Lists');
  const [objectives, setObjectives] = useState(
    'Implement a singly linked list in Python\nUnderstand time complexity of insert and delete',
  );
  const [difficulty, setDifficulty] = useState<GenerateMaterialInput['difficulty']>('intermediate');
  const [duration, setDuration] = useState(90);
  const [requirements, setRequirements] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (files && files[0]) setFile(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function formatSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleGenerate() {
    const learningObjectives = objectives
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);

    if (!labId.trim() || !title.trim() || learningObjectives.length === 0) {
      setError('Lab ID, title, and at least one learning objective are required.');
      return;
    }

    setGenerating(true);
    setError(null);
    const result = await generateMaterialWithUpload(
      {
        lab_id: labId.trim(),
        course_id: 'csc580',
        title: title.trim(),
        learning_objectives: learningObjectives,
        difficulty,
        estimated_duration_min: duration,
        instructor_id: instructorId.trim() || 'instructor',
        agent_instructions: requirements.trim(),
      },
      file,
    );
    setGenerating(false);
    if (result) {
      window.dispatchEvent(new CustomEvent('curriculum:changed'));
      onClose();
    } else {
      setError('Could not generate material. Check Orchestrator, Curriculum Designer, and the LLM API key.');
    }
  }

  return (
    <Modal title="Generate Lab Material" onClose={onClose} width={640}>
      <div className="generate-form-grid">
        <label className="modal-field">
          <span>Lab ID</span>
          <input value={labId} onChange={e => setLabId(e.target.value)} />
        </label>

        <label className="modal-field">
          <span>Instructor ID</span>
          <input value={instructorId} onChange={e => setInstructorId(e.target.value)} />
        </label>

        <label className="modal-field modal-field-wide">
          <span>Lab Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </label>

        <label className="modal-field modal-field-wide">
          <span>Learning Objectives</span>
          <textarea
            value={objectives}
            onChange={e => setObjectives(e.target.value)}
            rows={4}
          />
        </label>

        <label className="modal-field">
          <span>Difficulty</span>
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value as GenerateMaterialInput['difficulty'])}
          >
            <option value="basic">basic</option>
            <option value="intermediate">intermediate</option>
            <option value="challenge">challenge</option>
          </select>
        </label>

        <label className="modal-field">
          <span>Duration</span>
          <input
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={e => setDuration(Number(e.target.value) || 90)}
          />
        </label>

        <label className="modal-field modal-field-wide">
          <span>Generation Requirements</span>
          <textarea
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            rows={3}
            placeholder="Focus the quiz on pointer edge cases and include one code question."
          />
        </label>
      </div>

      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}${file ? ' dropzone-filled' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        {file ? (
          <>
            <div className="dropzone-icon">PDF</div>
            <div className="dropzone-filename">{file.name}</div>
            <div className="dropzone-meta">{formatSize(file.size)}</div>
          </>
        ) : (
          <>
            <div className="dropzone-icon">PDF</div>
            <div className="dropzone-cta">Reference material</div>
            <div className="dropzone-meta">or click to browse</div>
            <div className="dropzone-hint">PDF, TXT, MD · Max 25 MB</div>
          </>
        )}
      </div>

      {file && (
        <button
          className="dropzone-clear"
          onClick={e => { e.stopPropagation(); setFile(null); }}
        >
          Remove file
        </button>
      )}

      {error && <div className="error-state">{error}</div>}

      <div className="modal-footer">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          disabled={generating}
          onClick={handleGenerate}
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </Modal>
  );
}
