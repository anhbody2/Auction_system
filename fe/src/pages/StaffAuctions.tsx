import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api, money, type Auction } from '../api';
import { NewTag, StatusBadge } from '../components/AuctionBits';
import { Field } from '../components/Field';
import { Pager } from '../components/TransactionTable';
import { useToast } from '../toast';
import { toLocalInput } from './CreateAuction';

const BASE = '/staff/manage/auctions';

export interface StaffAuction extends Auction {
  reservePrice: number | null;
  deletedAt: string | null;
  settlement: { status: string; commission: number; settledAt: string | null } | null;
}

interface StaffBid {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  bidder: { id: number; username: string };
}

const STATUS_OPTIONS: [string, string][] = [
  ['', 'All (not deleted)'],
  ['upcoming', 'Upcoming'],
  ['active', 'Active'],
  ['ended', 'Ended'],
  ['cancelled', 'Cancelled'],
  ['deleted', 'Deleted'],
];

/** stf-006: list, search and page auctions; filters live in the URL. */
export function StaffAuctionsPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const page = Number(get('page') || '1') || 1;
  const filters = { q: get('q'), seller: get('seller'), status: get('status'), from: get('from'), to: get('to') };
  const key = JSON.stringify(filters);
  const [draft, setDraft] = useState(filters);
  const [data, setData] = useState<{ auctions: StaffAuction[]; total: number; page: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const f = JSON.parse(key) as typeof filters;
    setDraft(f);
    const qs = new URLSearchParams({ ...f, status: f.status || 'all', tz: String(new Date().getTimezoneOffset()), page: String(page), pageSize: '20' });
    setError('');
    api<{ auctions: StaffAuction[]; total: number; page: number; pageSize: number }>(`${BASE}?${qs}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : 'Could not load auctions'));
  }, [key, page]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) if (v.trim()) next[k] = v.trim();
    setParams(next);
  };
  const goPage = (p: number) => setParams({ ...Object.fromEntries(params), page: String(p) });
  const bind = (k: keyof typeof draft) => ({ name: k, value: draft[k], onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value }) });

  return (
    <div>
      <div className="row spread">
        <h1>Auction management</h1>
        <Link to="/staff/auctions/new" className="btn btn-primary">
          + Add auction
        </Link>
      </div>
      <form className="card row filters" role="search" aria-label="Search auctions" onSubmit={apply} style={{ flexWrap: 'wrap' }}>
        <label className="field grow">
          Auction name
          <input {...bind('q')} />
        </label>
        <label className="field">
          Seller
          <input placeholder="Username or name" {...bind('seller')} />
        </label>
        <label className="field">
          Status
          <select {...bind('status')}>
            {STATUS_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Starts from
          <input type="date" {...bind('from')} />
        </label>
        <label className="field">
          Starts to
          <input type="date" {...bind('to')} />
        </label>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p className="muted">Loading...</p>
      ) : data.auctions.length === 0 ? (
        <p className="muted">No auctions match these filters.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table data-testid="staff-auctions">
              <thead>
                <tr>
                  <th>Auction</th>
                  <th>Seller</th>
                  <th>Status</th>
                  <th>Starts</th>
                  <th>Price</th>
                  <th>Bids</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.auctions.map((a) => (
                  <tr key={a.id} data-testid={`staff-auction-${a.id}`}>
                    <td>{a.name}</td>
                    <td>{a.seller.username}</td>
                    <td>
                      {a.deletedAt ? <span className="badge badge-cancelled">deleted</span> : <StatusBadge status={a.status} />}{' '}
                      {!a.deletedAt && <NewTag status={a.status} startTime={a.startTime} />}
                    </td>
                    <td>{new Date(a.startTime).toLocaleString()}</td>
                    <td>{money(a.currentPrice ?? a.initialPrice)}</td>
                    <td>{a.bidCount}</td>
                    <td>
                      <Link className="btn btn-ghost btn-small" to={`/staff/auctions/${a.id}`} aria-label={`View ${a.name}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={goPage} noun={['auction', 'auctions']} testId="auctions-total" />
        </>
      )}
    </div>
  );
}

interface TermsValues {
  name: string;
  description: string;
  initialPrice: string;
  reservePrice: string;
  startTime: string;
  durationValue: string;
  durationUnit: 'hours' | 'days';
}

const termsFrom = (a: StaffAuction): TermsValues => {
  const days = a.durationMinutes % (24 * 60) === 0;
  return {
    name: a.name,
    description: a.description ?? '',
    initialPrice: String(a.initialPrice),
    reservePrice: a.reservePrice == null ? '' : String(a.reservePrice),
    startTime: toLocalInput(new Date(a.startTime)),
    durationValue: String(days ? a.durationMinutes / (24 * 60) : a.durationMinutes / 60),
    durationUnit: days ? 'days' : 'hours',
  };
};

const termsBody = (v: TermsValues) => ({
  name: v.name,
  description: v.description,
  initialPrice: v.initialPrice,
  reservePrice: v.reservePrice.trim() === '' ? null : v.reservePrice,
  startTime: v.startTime ? new Date(v.startTime).toISOString() : '',
  duration: { value: Number(v.durationValue), unit: v.durationUnit },
});

/** Name, description, prices, start and duration; `descriptionOnly` locks the rest (started auctions). */
function TermsFields({
  values,
  onChange,
  errors,
  descriptionOnly = false,
}: {
  values: TermsValues;
  onChange: (v: TermsValues) => void;
  errors: Record<string, string>;
  descriptionOnly?: boolean;
}) {
  const bind = (k: keyof TermsValues) => ({
    name: k,
    value: values[k],
    error: errors[k],
    disabled: descriptionOnly && k !== 'description',
    onChange: (e: { target: { value: string } }) => onChange({ ...values, [k]: e.target.value }),
  });
  const plain = (k: keyof TermsValues) => {
    const { error: _error, ...rest } = bind(k);
    return rest;
  };
  return (
    <>
      <Field label="Auction name" {...bind('name')} />
      <Field label="Description" multiline {...bind('description')} />
      <div className="grid stats">
        <Field label="Starting price" inputMode="decimal" {...bind('initialPrice')} />
        <Field label="Reserve price (optional)" inputMode="decimal" {...bind('reservePrice')} />
      </div>
      <div className="grid stats">
        <Field label="Start time" type="datetime-local" {...bind('startTime')} />
        <div className="field">
          <span className="label">Duration</span>
          <div className="row">
            <input aria-label="Duration amount" inputMode="numeric" {...plain('durationValue')} />
            <select aria-label="Duration unit" {...plain('durationUnit')}>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
          {errors.duration && <span className="field-error">{errors.duration}</span>}
        </div>
      </div>
    </>
  );
}

/** stf-006: one auction: details, bids, settlement, edit, delete. */
export function StaffAuctionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<{ auction: StaffAuction; bids: StaffBid[] } | null>(null);
  const [problem, setProblem] = useState('');
  const [editing, setEditing] = useState<TermsValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ auction: StaffAuction; bids: StaffBid[] }>(`${BASE}/${id}`)
      .then(setData)
      .catch((err) => setProblem(err instanceof ApiError ? err.message : 'Could not load the auction'));
  }, [id]);
  useEffect(load, [load]);

  if (problem) return <p className="muted">{problem}</p>;
  if (!data) return <p className="muted">Loading...</p>;
  const { auction: a, bids } = data;
  const started = a.status !== 'upcoming';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setErrors({});
    try {
      const body = started ? { description: editing.description } : termsBody(editing);
      const res = await api<{ message: string }>(`${BASE}/${id}`, { method: 'PATCH', body });
      toast(res.message, 'success');
      setEditing(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`${BASE}/${id}`, { method: 'DELETE' });
      toast(res.message, 'success');
      navigate('/staff/auctions');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Delete failed', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
      <p className="small">
        <Link to="/staff/auctions">← Auction management</Link>
      </p>
      <div className="row spread">
        <h1>{a.name}</h1>
        <span className="row tags">
          {a.deletedAt ? <span className="badge badge-cancelled">deleted</span> : <StatusBadge status={a.status} />}
          {!a.deletedAt && <NewTag status={a.status} startTime={a.startTime} />}
        </span>
      </div>

      {editing ? (
        <form onSubmit={save} noValidate aria-label="Edit auction">
          {started && <p className="notice">This auction has started: only the description can be changed.</p>}
          <TermsFields values={editing} onChange={setEditing} errors={errors} descriptionOnly={started} />
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save changes
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="details" data-testid="staff-auction-details">
          <dt>Seller</dt>
          <dd>{a.seller.username}</dd>
          <dt>Goods</dt>
          <dd>{a.goods.name}</dd>
          <dt>Description</dt>
          <dd>{a.description}</dd>
          <dt>Starting price</dt>
          <dd>{money(a.initialPrice)}</dd>
          <dt>Reserve price</dt>
          <dd>{a.reservePrice == null ? '-' : money(a.reservePrice)}</dd>
          <dt>Current price</dt>
          <dd>{money(a.currentPrice)}</dd>
          <dt>Starts</dt>
          <dd>{new Date(a.startTime).toLocaleString()}</dd>
          <dt>Ends</dt>
          <dd>{new Date(a.endTime).toLocaleString()}</dd>
          <dt>Winner</dt>
          <dd>{a.winner?.username ?? '-'}</dd>
          <dt>Settlement</dt>
          <dd>{a.settlement ? `${a.settlement.status}, commission ${money(a.settlement.commission)}` : '-'}</dd>
          {a.deletedAt && (
            <>
              <dt>Deleted</dt>
              <dd>{new Date(a.deletedAt).toLocaleString()}</dd>
            </>
          )}
        </dl>
      )}

      {!a.deletedAt && !editing && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {a.status !== 'cancelled' && (
            <button className="btn btn-ghost" onClick={() => setEditing(termsFrom(a))}>
              Edit
            </button>
          )}
          {confirmDelete ? (
            <span className="row" role="group" aria-label={`Confirm delete ${a.name}`}>
              <span className="small">
                Delete {a.name}?{(a.status === 'upcoming' || a.status === 'active') && a.bidCount > 0 ? ' All bids are voided and held credit is released.' : ''}
              </span>
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Yes, delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}

      <h2>Bids</h2>
      {bids.length === 0 ? (
        <p className="muted">No bids.</p>
      ) : (
        <div className="table-wrap">
          <table data-testid="staff-auction-bids">
            <thead>
              <tr>
                <th>Bidder</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {bids.map((b) => (
                <tr key={b.id}>
                  <td>{b.bidder.username}</td>
                  <td>{money(b.amount)}</td>
                  <td>
                    <span className="badge">{b.status}</span>
                  </td>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** stf-006: add an auction for a seller from their approved, available goods. */
export function StaffAuctionNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [seller, setSeller] = useState('');
  const [goods, setGoods] = useState<{ id: number; name: string; description: string | null }[] | null>(null);
  const [goodsId, setGoodsId] = useState('');
  const [values, setValues] = useState<TermsValues>({
    name: '',
    description: '',
    initialPrice: '',
    reservePrice: '',
    startTime: toLocalInput(new Date(Date.now() + 10 * 60_000)),
    durationValue: '1',
    durationUnit: 'days',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const findGoods = async () => {
    setErrors({});
    setGoods(null);
    setGoodsId('');
    try {
      const res = await api<{ goods: { id: number; name: string; description: string | null }[] }>(`${BASE}/seller-goods?seller=${encodeURIComponent(seller)}`);
      setGoods(res.goods);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    }
  };

  const pick = (id: string) => {
    setGoodsId(id);
    const g = goods?.find((x) => String(x.id) === id);
    if (g) setValues((v) => ({ ...v, name: v.name || g.name, description: v.description || (g.description ?? '') }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await api<{ message: string; auction: StaffAuction }>(BASE, { body: { seller, goodsId: goodsId ? Number(goodsId) : '', ...termsBody(values) } });
      toast(res.message, 'success');
      navigate(`/staff/auctions/${res.auction.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1>Add auction for a seller</h1>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Seller (username or email)" name="seller" value={seller} error={errors.seller} onChange={(e) => setSeller(e.target.value)} />
        <button className="btn btn-ghost" type="button" onClick={findGoods} disabled={!seller.trim()}>
          Find goods
        </button>
      </div>
      {goods && (
        <form onSubmit={submit} noValidate aria-label="New auction">
          {goods.length === 0 ? (
            <p className="muted" data-testid="no-seller-goods">
              This seller has no approved goods available for an auction.
            </p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="goodsId">Goods</label>
                <select id="goodsId" value={goodsId} onChange={(e) => pick(e.target.value)}>
                  <option value="">Choose...</option>
                  {goods.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {errors.goodsId && <span className="field-error">{errors.goodsId}</span>}
              </div>
              <TermsFields values={values} onChange={setValues} errors={errors} />
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Create auction
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
