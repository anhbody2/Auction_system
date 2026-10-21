import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, api } from '../api';
import { StatusBadge } from '../components/AuctionBits';
import { EMPTY_GOODS, GoodsForm, type GoodsValues } from '../components/GoodsForm';
import { Pager } from '../components/TransactionTable';
import { useToast } from '../toast';
import { toGoodsBody } from './MyGoods';

/** stf-005: stored goods.status values, as staff see them. */
export type StaffGoodsStatus = 'pending' | 'active' | 'rejected' | 'deleted';
export const STAFF_GOODS_LABELS: Record<StaffGoodsStatus, string> = {
  pending: 'pending approval',
  active: 'approved',
  rejected: 'rejected',
  deleted: 'deleted',
};

export interface StaffGoods {
  id: number;
  name: string;
  description: string | null;
  condition: string | null;
  category: { id: number; name: string } | null;
  images: string[];
  status: StaffGoodsStatus;
  rejectionReason: string | null;
  seller: { id: number; username: string };
  buyer: { id: number; username: string } | null;
  reviewedBy: { id: number; username: string } | null;
  reviewedAt: string | null;
  inOpenAuction: boolean;
  auctions: { id: number; name: string; status: string; startTime: string }[];
  createdAt: string;
}

const PAGE_SIZE = 20;

export function StaffGoodsBadge({ status }: { status: StaffGoodsStatus }) {
  const cls = status === 'active' ? 'available' : status === 'deleted' ? 'sold' : status;
  return (
    <span className={`badge badge-${cls}`} data-testid="staff-goods-status">
      {STAFF_GOODS_LABELS[status]}
    </span>
  );
}

/** stf-005: list, search and page goods; filters live in the URL. */
export function StaffGoodsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const seller = params.get('seller') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [draft, setDraft] = useState({ q, seller, categoryId, status });
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<{ goods: StaffGoods[]; total: number; page: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);
  useEffect(() => {
    setDraft({ q, seller, categoryId, status });
    const qs = new URLSearchParams({ q, seller, categoryId, status: status || 'all', page: String(page), pageSize: String(PAGE_SIZE) });
    setError('');
    api<{ goods: StaffGoods[]; total: number; page: number; pageSize: number }>(`/staff/goods?${qs}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load goods'));
  }, [q, seller, categoryId, status, page]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) if (v.trim()) next[k] = v.trim();
    setParams(next);
  };
  const goPage = (p: number) => setParams({ ...Object.fromEntries(params), page: String(p) });

  return (
    <div>
      <div className="row spread">
        <h1>Goods management</h1>
        <Link to="/staff/goods/new" className="btn btn-primary">
          + Add goods
        </Link>
      </div>
      <form className="card row filters" role="search" aria-label="Search goods" onSubmit={apply}>
        <label className="field grow">
          Name
          <input name="q" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        </label>
        <label className="field">
          Seller
          <input name="seller" placeholder="Username or name" value={draft.seller} onChange={(e) => setDraft({ ...draft, seller: e.target.value })} />
        </label>
        <label className="field">
          Category
          <select name="categoryId" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            <option value="">All (not deleted)</option>
            <option value="pending">Pending approval</option>
            <option value="active">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">Loading...</p>
      ) : data.goods.length === 0 ? (
        <p className="muted">No goods match these filters.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table data-testid="staff-goods">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Seller</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.goods.map((g) => (
                  <tr key={g.id} data-testid={`staff-goods-${g.id}`}>
                    <td>{g.images[0] ? <img className="goods-thumb" src={g.images[0]} alt="" /> : <span className="muted small">No image</span>}</td>
                    <td>{g.name}</td>
                    <td>{g.seller.username}</td>
                    <td>{g.category?.name ?? '-'}</td>
                    <td>
                      <StaffGoodsBadge status={g.status} />
                    </td>
                    <td>{new Date(g.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Link className="btn btn-ghost btn-small" to={`/staff/goods/${g.id}`} aria-label={`View ${g.name}`}>
                        {g.status === 'pending' ? 'Review' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={goPage} noun={['goods item', 'goods items']} testId="goods-total" />
        </>
      )}
    </div>
  );
}

/** stf-005: one goods item: details, approve/reject, edit, delete. */
export function StaffGoodsDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [goods, setGoods] = useState<StaffGoods | null>(null);
  const [problem, setProblem] = useState('');
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ goods: StaffGoods }>(`/staff/goods/${id}`)
      .then((r) => setGoods(r.goods))
      .catch((err) => setProblem(err instanceof ApiError ? err.message : 'Could not load the goods'));
  }, [id]);
  useEffect(load, [load]);

  const act = async (path: string, init: { method?: string; body?: unknown }, after?: () => void) => {
    setBusy(true);
    try {
      const res = await api<{ message: string; goods?: StaffGoods }>(`/staff/goods/${id}${path}`, init);
      toast(res.message, 'success');
      if (res.goods) setGoods(res.goods);
      after?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (problem) return <p className="muted">{problem}</p>;
  if (!goods) return <p className="muted">Loading...</p>;

  const save = async (values: GoodsValues) => {
    const res = await api<{ message: string; goods: StaffGoods }>(`/staff/goods/${id}`, { method: 'PATCH', body: toGoodsBody(values) });
    setGoods(res.goods);
    setEditing(false);
    toast(res.message, 'success');
  };

  return (
    <div className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
      <p className="small">
        <Link to="/staff/goods">← Goods management</Link>
      </p>
      <div className="row spread">
        <h1>{goods.name}</h1>
        <StaffGoodsBadge status={goods.status} />
      </div>
      {goods.status === 'rejected' && goods.rejectionReason && <p className="error">Rejected: {goods.rejectionReason}</p>}

      {editing ? (
        <GoodsForm
          initial={{
            name: goods.name,
            description: goods.description ?? '',
            categoryId: goods.category ? String(goods.category.id) : '',
            condition: goods.condition ?? '',
            images: goods.images,
          }}
          submitLabel="Save changes"
          onSubmit={save}
        />
      ) : (
        <>
          <ul className="thumbs">
            {goods.images.map((url, i) => (
              <li key={url}>
                <img src={url} alt={`${goods.name} image ${i + 1}`} />
              </li>
            ))}
          </ul>
          <dl className="details" data-testid="staff-goods-details">
            <dt>Description</dt>
            <dd>{goods.description}</dd>
            <dt>Category</dt>
            <dd>{goods.category?.name ?? '-'}</dd>
            <dt>Condition</dt>
            <dd>{goods.condition ? CONDITION_LABELS[goods.condition] ?? goods.condition : '-'}</dd>
            <dt>Seller</dt>
            <dd>{goods.seller.username}</dd>
            <dt>Buyer</dt>
            <dd>{goods.buyer?.username ?? '-'}</dd>
            <dt>Reviewed</dt>
            <dd>{goods.reviewedAt ? `${new Date(goods.reviewedAt).toLocaleString()} by ${goods.reviewedBy?.username ?? 'staff'}` : '-'}</dd>
          </dl>
          <h2>Auctions</h2>
          {goods.auctions.length === 0 ? (
            <p className="muted">Never auctioned.</p>
          ) : (
            <ul>
              {goods.auctions.map((a) => (
                <li key={a.id}>
                  <Link to={`/auctions/${a.id}`}>{a.name}</Link> <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {goods.status !== 'deleted' && !editing && (
        <div className="row actions" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
          {goods.status === 'pending' && !rejecting && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={() => act('/approve', { method: 'POST' })}>
                Approve
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
            </>
          )}
          {rejecting && (
            <form
              className="row"
              aria-label="Reject goods"
              onSubmit={(e) => {
                e.preventDefault();
                act('/reject', { method: 'POST', body: { reason } }, () => setRejecting(false));
              }}
            >
              <label className="field grow">
                Reason (optional)
                <input name="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button className="btn btn-danger" type="submit" disabled={busy}>
                Confirm reject
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setRejecting(false)}>
                Cancel
              </button>
            </form>
          )}
          <button className="btn btn-ghost" disabled={goods.inOpenAuction} onClick={() => setEditing(true)}>
            Edit
          </button>
          {confirmDelete ? (
            <span className="row" role="group" aria-label={`Confirm delete ${goods.name}`}>
              <span className="small">Delete {goods.name}?</span>
              <button className="btn btn-danger" disabled={busy} onClick={() => act('', { method: 'DELETE' }, () => navigate('/staff/goods'))}>
                Yes, delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost" disabled={goods.inOpenAuction} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          {goods.inOpenAuction && <span className="muted small">In an upcoming or active auction: cannot be edited or deleted.</span>}
        </div>
      )}
      {editing && (
        <button className="btn btn-ghost" onClick={() => setEditing(false)}>
          Cancel editing
        </button>
      )}
    </div>
  );
}

/** stf-005: add goods for a chosen seller; approved at once. */
export function StaffGoodsNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [seller, setSeller] = useState('');
  const [sellerError, setSellerError] = useState('');

  const submit = async (values: GoodsValues) => {
    setSellerError('');
    try {
      const res = await api<{ message: string; goods: StaffGoods }>('/staff/goods', { body: { ...toGoodsBody(values), seller } });
      toast(res.message, 'success');
      navigate(`/staff/goods/${res.goods.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields.seller) setSellerError(err.fields.seller);
      throw err;
    }
  };

  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Add goods for a seller</h1>
      <div className="field">
        <label htmlFor="seller">Seller (username or email)</label>
        <input id="seller" name="seller" value={seller} onChange={(e) => setSeller(e.target.value)} aria-invalid={!!sellerError || undefined} />
        {sellerError && (
          <span className="field-error" role="alert">
            {sellerError}
          </span>
        )}
      </div>
      <GoodsForm initial={EMPTY_GOODS} submitLabel="Add goods" onSubmit={submit} />
    </div>
  );
}
