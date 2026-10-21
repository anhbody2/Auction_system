import { useId, useState, type ChangeEvent } from 'react';
import { http, toApiError } from '../api';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 5;
const HARD_CAP_MB = 20;

interface UploadResult {
  url: string;
  bytes: number;
  originalBytes: number;
  resized: boolean;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * POST /api/uploads with one file; resolves to the stored image or throws its error message.
 * sys-004: sent through the shared Axios client, which reports upload progress (0-100).
 */
export async function uploadImage(file: File, onProgress?: (percent: number) => void): Promise<UploadResult> {
  const body = new FormData();
  body.append('image', file);
  try {
    const res = await http.post<UploadResult>('/uploads', body, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
    return res.data;
  } catch (err) {
    const apiError = toApiError(err);
    throw new Error(apiError.fields.image ?? apiError.message ?? 'Upload failed');
  }
}

interface Props {
  label: string;
  name: string;
  value: string[];
  onChange: (urls: string[]) => void;
  /** Most images that can be attached; 1 replaces the current image. */
  max?: number;
  error?: string;
}

/**
 * upl-001: pick JPEG/PNG/WebP files from the device; each is uploaded at once and previewed.
 * Files over 5 MB are resized by the server; files over 20 MB are refused before uploading.
 */
export function ImageUpload({ label, name, value, onChange, max = 1, error }: Props) {
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setProblem('');
    setBusy(true);
    let urls = max === 1 ? [] : [...value];
    try {
      for (const file of files.slice(0, max === 1 ? 1 : Math.max(0, max - urls.length))) {
        if (file.size > HARD_CAP_MB * 1024 * 1024) throw new Error(`${file.name} is over ${HARD_CAP_MB} MB`);
        setProgress(0);
        const up = await uploadImage(file, setProgress);
        urls = [...urls, up.url];
        if (up.resized) setNotes((n) => ({ ...n, [up.url]: `Resized from ${mb(up.originalBytes)} to ${mb(up.bytes)} to fit the ${MAX_MB} MB limit` }));
        onChange(urls);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = (url: string) => onChange(value.filter((u) => u !== url));
  const shown = problem || error;
  const full = max > 1 && value.length >= max;

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        onChange={onPick}
        disabled={busy || full}
        aria-invalid={shown ? true : undefined}
        aria-describedby={hintId}
      />
      <span className="muted small" id={hintId} data-testid={`${name}-hint`}>
        {busy ? `Uploading...${progress != null ? ` ${progress}%` : ''}` : `JPEG, PNG or WebP. Images over ${MAX_MB} MB are resized; up to ${HARD_CAP_MB} MB.`}
      </span>
      {shown && (
        <span className="field-error" role="alert" id={`${name}-error`}>
          {shown}
        </span>
      )}
      {busy && progress != null && (
        <progress className="upload-progress" max={100} value={progress} aria-label={`Upload progress for ${label}`} />
      )}
      {value.length > 0 && (
        <ul className="thumbs" data-testid={`${name}-previews`}>
          {value.map((url, i) => (
            <li key={url}>
              <img src={url} alt={`Uploaded image ${i + 1}`} />
              {notes[url] && <span className="muted small">{notes[url]}</span>}
              <button type="button" className="btn btn-ghost" onClick={() => remove(url)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
