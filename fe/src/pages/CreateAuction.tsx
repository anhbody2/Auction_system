import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, api, type Auction, type Goods } from '../api';
import { Field } from '../components/Field';
import { useToast } from '../toast';

type DurationUnit = 'hours' | 'days';
const DURATION_MESSAGE = 'Duration must be between 1 hour and 30 days';

/** sell-004: minutes for a number + unit, or null outside 1 hour - 30 days (the server checks the same). */
export function durationMinutes(value: string, unit: DurationUnit) {
  const n = Number(value);
  if (value.trim() === '' || !Number.isInteger(n)) return null;
  const minutes = n * (unit === 'hours' ? 60 : 24 * 60);
  return minutes >= 60 && minutes <= 30 * 24 * 60 ? minutes : null;
}

/** yyyy-MM-ddTHH:mm in local time, as used by <input type="datetime-local"> */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The chosen goods' images and details (sell-003: these come from My goods, not from this form). */
function GoodsPreview({ goods }: { goods: Goods }) {
  return (
    <div className="card" data-testid="goods-preview">
      <div className="row">
        {goods.images.map((url, i) => (
          <img key={url} className="goods-thumb" src={url} alt={`${goods.name} image ${i + 1}`} />
        ))}
      </div>
      <p className="small">
        <strong>{goods.name}</strong> · {goods.category?.name ?? 'No category'} · {goods.condition ? CONDITION_LABELS[goods.condition] ?? goods.condition : '-'}
      </p>
      {goods.description && <p className="muted small">{goods.description}</p>}
    </div>
  );
}

export function CreateAuctionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  // sell-006: only goods that can go into a new auction; busy and sold goods are not listed at all.
  const [available, setAvailable] = useState<Goods[] | null>(null);
  // Whether the seller has any goods at all; only asked for when none are available, to word the message.
  const [hasAnyGoods, setHasAnyGoods] = useState(false);
  const [unavailableLink, setUnavailableLink] = useState(false);
  const [values, setValues] = useState(() => ({
    goodsId: '',
    name: '',
    description: '',
    initialPrice: '',
    reservePrice: '',
    startTime: toLocalInput(new Date()),
    durationValue: '1',
    durationUnit: 'days' as DurationUnit,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ goods: Goods[] }>('/me/goods?status=available').then(async (r) => {
      if (r.goods.length === 0) setHasAnyGoods((await api<{ goods: Goods[] }>('/me/goods')).goods.length > 0);
      const linked = params.get('goodsId');
      const g = linked ? r.goods.find((x) => String(x.id) === linked) : undefined;
      // A ?goodsId= link to goods that are busy, sold or not the seller's preselects nothing.
      if (g) setValues((v) => ({ ...v, goodsId: String(g.id), name: g.name, description: g.description ?? '' }));
      else if (linked) setUnavailableLink(true);
      setAvailable(r.goods);
    });
  }, [params]);

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors(({ [name]: _, ...rest }) => rest);
  };
  const bind = (name: keyof typeof values) => ({ name, value: values[name], error: errors[name], onChange: set(name) });

  const chosen = available?.find((g) => String(g.id) === values.goodsId);

  // Picking goods fills in the auction name and description; the seller can still change them.
  const pick = (e: { target: { value: string } }) => {
    const g = available?.find((x) => String(x.id) === e.target.value);
    setValues((v) => ({ ...v, goodsId: e.target.value, name: g?.name ?? v.name, description: g?.description ?? v.description }));
    setErrors(({ goodsId: _, name: _n, description: _d, ...rest }) => rest);
    setUnavailableLink(false);
  };

  const minutes = durationMinutes(values.durationValue, values.durationUnit);
  const start = values.startTime ? new Date(values.startTime) : null;
  const startValid = start && !Number.isNaN(start.getTime());
  // Shown as the seller types; the server works out the stored end time the same way.
  const endsAt = startValid && minutes !== null ? new Date(Math.max(start.getTime(), Date.now()) + minutes * 60_000) : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (minutes === null) {
      setErrors((er) => ({ ...er, duration: DURATION_MESSAGE }));
      return;
    }
    setBusy(true);
    try {
      const { durationValue, durationUnit, ...rest } = values;
      const res = await api<{ auction: Auction }>('/auctions', {
        body: {
          ...rest,
          startTime: values.startTime ? new Date(values.startTime).toISOString() : '',
          duration: { value: Number(durationValue), unit: durationUnit },
        },
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

  const notAvailable = unavailableLink && (
    <p className="error" role="alert" data-testid="goods-not-available">
      That goods item is not available for a new auction
    </p>
  );

  if (!available) return <p className="muted">Loading...</p>;
  if (available.length === 0) {
    return (
      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>Create auction</h1>
        {notAvailable}
        <p data-testid="no-goods">
          {!hasAnyGoods ? "You haven't added any goods yet." : 'All your goods are in an auction or sold.'} Add the goods you want to sell
          first.
        </p>
        <Link to="/goods/new" className="btn btn-primary">
          Add goods
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Create auction</h1>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="goodsId">Goods</label>
          <select id="goodsId" value={values.goodsId} onChange={pick} aria-invalid={!!errors.goodsId || undefined}>
            <option value="">Choose goods...</option>
            {available.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {notAvailable}
          {errors.goodsId && (
            <span className="field-error" id="goodsId-error">
              {errors.goodsId}
            </span>
          )}
          <span className="muted small">
            Images and details come from <Link to="/goods">My goods</Link>. Only goods that are not in an auction or sold are listed.
          </span>
        </div>
        {chosen && <GoodsPreview goods={chosen} />}
        <Field label="Auction name" {...bind('name')} />
        <Field label="Description" multiline {...bind('description')} />
        <div className="grid stats">
          <Field label="Starting price" inputMode="decimal" {...bind('initialPrice')} />
          <Field label="Reserve price (optional)" inputMode="decimal" {...bind('reservePrice')} />
        </div>
        <div className="grid stats">
          <Field label="Start time" type="datetime-local" {...bind('startTime')} />
          <div className="field">
            <span className="label" id="duration-label">
              Duration
            </span>
            <div className="row" role="group" aria-labelledby="duration-label">
              <input
                id="durationValue"
                aria-label="Duration amount"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={values.durationValue}
                onChange={(e) => {
                  set('durationValue')(e);
                  setErrors(({ duration: _, ...r }) => r);
                }}
                aria-invalid={!!errors.duration || undefined}
                aria-describedby="duration-hint"
                style={{ width: '6rem' }}
              />
              <select
                id="durationUnit"
                aria-label="Duration unit"
                value={values.durationUnit}
                onChange={(e) => {
                  set('durationUnit')(e);
                  setErrors(({ duration: _, ...r }) => r);
                }}
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            {errors.duration ? (
              <span className="field-error" role="alert" id="duration-error">
                {errors.duration}
              </span>
            ) : (
              <span className="muted small" id="duration-hint" data-testid="ends-at">
                {endsAt ? `Ends ${endsAt.toLocaleString()}` : '1 hour to 30 days'}
              </span>
            )}
          </div>
        </div>
        <p className="muted small">Bids rise by the standard increment ladder ($0.05 under $1, $0.50 from $1, $1 from $10, $2.50 from $50, $10 from $100, $100 from $1,000).</p>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create auction'}
        </button>
      </form>
    </div>
  );
}
