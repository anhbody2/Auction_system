import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, api, type Auction } from '../api';
import { Field } from '../components/Field';
import { ImageUpload } from '../components/ImageUpload';
import { useToast } from '../toast';

interface Category {
  id: number;
  name: string;
}

/** yyyy-MM-ddTHH:mm in local time, as used by <input type="datetime-local"> */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateAuctionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [values, setValues] = useState(() => ({
    name: '',
    description: '',
    categoryId: '',
    condition: '',
    imageUrl: '',
    initialPrice: '',
    reservePrice: '',
    startTime: toLocalInput(new Date()),
    endTime: toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors(({ [name]: _, ...rest }) => rest);
  };
  const bind = (name: keyof typeof values) => ({ name, value: values[name], error: errors[name], onChange: set(name) });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const toIso = (s: string) => (s ? new Date(s).toISOString() : '');
      const res = await api<{ auction: Auction }>('/auctions', {
        body: { ...values, startTime: toIso(values.startTime), endTime: toIso(values.endTime) },
      });
      toast('Auction created', 'success');
      navigate(`/auctions/${res.auction.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast(err.message, 'error');
      }
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
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Create auction</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Item name" {...bind('name')} />
        <Field label="Description" multiline {...bind('description')} />
        <div className="grid stats">
          <div className="field">
            <label htmlFor="categoryId">Category</label>
            <select id="categoryId" value={values.categoryId} onChange={set('categoryId')} aria-invalid={!!errors.categoryId || undefined}>
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
            <select id="condition" value={values.condition} onChange={set('condition')} aria-invalid={!!errors.condition || undefined}>
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
          label="Image (optional)"
          name="imageUrl"
          value={values.imageUrl ? [values.imageUrl] : []}
          onChange={(urls) => set('imageUrl')({ target: { value: urls[0] ?? '' } })}
          error={errors.imageUrl}
        />
        <div className="grid stats">
          <Field label="Starting price" inputMode="decimal" {...bind('initialPrice')} />
          <Field label="Reserve price (optional)" inputMode="decimal" {...bind('reservePrice')} />
        </div>
        <div className="grid stats">
          <Field label="Start time" type="datetime-local" {...bind('startTime')} />
          <Field label="End time" type="datetime-local" {...bind('endTime')} />
        </div>
        <p className="muted small">Bids rise by the standard increment ladder ($0.50 from $1, $1 from $10, $2.50 from $50, $5 from $100, $10 from $500, $25 from $1,000, $100 from $5,000).</p>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create auction'}
        </button>
      </form>
    </div>
  );
}
