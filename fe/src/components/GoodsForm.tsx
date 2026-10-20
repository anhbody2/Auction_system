import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, CONDITION_LABELS, api } from '../api';
import { Field } from './Field';
import { ImageUpload } from './ImageUpload';

interface Category {
  id: number;
  name: string;
}

export interface GoodsValues {
  name: string;
  description: string;
  categoryId: string;
  condition: string;
  images: string[];
}

export const EMPTY_GOODS: GoodsValues = { name: '', description: '', categoryId: '', condition: '', images: [] };

const MAX_IMAGES = 8;

/** Add/edit goods form (gds-001, gds-002). `onSubmit` sends the values; its ApiError fields show per field. */
export function GoodsForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: GoodsValues;
  submitLabel: string;
  onSubmit: (values: GoodsValues) => Promise<void>;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);

  const setField = (name: keyof GoodsValues, value: GoodsValues[keyof GoodsValues]) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors(({ [name]: _, ...rest }) => rest);
  };
  const bind = (name: 'name' | 'description') => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => setField(name, e.target.value),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (values.images.length === 0) {
      setErrors((er) => ({ ...er, images: 'Add at least one image' }));
      return;
    }
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  const selectError = (name: string) =>
    errors[name] && (
      <span className="field-error" id={`${name}-error`}>
        {errors[name]}
      </span>
    );

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Name" {...bind('name')} />
      <Field label="Description" multiline {...bind('description')} />
      <div className="grid stats">
        <div className="field">
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" value={values.categoryId} onChange={(e) => setField('categoryId', e.target.value)} aria-invalid={!!errors.categoryId || undefined}>
            <option value="">Choose...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectError('categoryId')}
        </div>
        <div className="field">
          <label htmlFor="condition">Condition</label>
          <select id="condition" value={values.condition} onChange={(e) => setField('condition', e.target.value)} aria-invalid={!!errors.condition || undefined}>
            <option value="">Choose...</option>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {selectError('condition')}
        </div>
      </div>
      <ImageUpload
        label={`Images (at least 1, up to ${MAX_IMAGES})`}
        name="images"
        max={MAX_IMAGES}
        value={values.images}
        onChange={(urls) => setField('images', urls)}
        error={errors.images}
      />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
