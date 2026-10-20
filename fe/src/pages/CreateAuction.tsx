import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, GOODS_STATUS_LABELS, api, type Auction, type Goods } from '../api';
import { Field } from '../components/Field';
import { useToast } from '../toast';

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
  const [goods, setGoods] = useState<Goods[] | null>(null);
  const [values, setValues] = useState(() => ({
    goodsId: params.get('goodsId') ?? '',
    name: '',
    description: '',
    initialPrice: '',
    reservePrice: '',
    startTime: toLocalInput(new Date()),
    endTime: toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ goods: Goods[] }>('/me/goods').then((r) => setGoods(r.goods));
  }, []);

  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors(({ [name]: _, ...rest }) => rest);
  };
  const bind = (name: keyof typeof values) => ({ name, value: values[name], error: errors[name], onChange: set(name) });

  const available = goods?.filter((g) => g.status === 'available') ?? [];
  const chosen = available.find((g) => String(g.id) === values.goodsId);

  // Picking goods fills in the auction name and description; the seller can still change them.
  const pick = (e: { target: { value: string } }) => {
    const g = available.find((x) => String(x.id) === e.target.value);
    setValues((v) => ({ ...v, goodsId: e.target.value, name: g?.name ?? v.name, description: g?.description ?? v.description }));
    setErrors(({ goodsId: _, name: _n, description: _d, ...rest }) => rest);
  };
  useEffect(() => {
    if (chosen && !values.name) pick({ target: { value: String(chosen.id) } });
    // Only when the goods list first arrives (a goodsId from the URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goods]);

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

  if (!goods) return <p className="muted">Loading...</p>;
  if (available.length === 0) {
    return (
      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>Create auction</h1>
        <p data-testid="no-goods">
          {goods.length === 0 ? "You haven't added any goods yet." : 'All your goods are in an auction or sold.'} Add the goods you want to sell
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
            {goods.map((g) => (
              <option key={g.id} value={g.id} disabled={g.status !== 'available'}>
                {g.status === 'available' ? g.name : `${g.name} (${GOODS_STATUS_LABELS[g.status]})`}
              </option>
            ))}
          </select>
          {errors.goodsId && (
            <span className="field-error" id="goodsId-error">
              {errors.goodsId}
            </span>
          )}
          <span className="muted small">
            Images and details come from <Link to="/goods">My goods</Link>. Goods in an auction or sold cannot be picked.
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
