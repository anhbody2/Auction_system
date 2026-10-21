import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, GOODS_STATUS_LABELS, api, type Goods } from '../api';
import { EMPTY_GOODS, GoodsForm, type GoodsValues } from '../components/GoodsForm';
import { useToast } from '../toast';

export function GoodsStatusBadge({ status, bought = false }: { status: Goods['status']; bought?: boolean }) {
  // gds-003: goods the user won and has not put up again read 'bought'.
  const label = bought && status === 'available' ? 'bought' : GOODS_STATUS_LABELS[status];
  return (
    <span className={`badge badge-${bought && status === 'available' ? 'bought' : status}`} data-testid="goods-status">
      {label}
    </span>
  );
}

/** Seller - Manage Goods (gds-001): the seller's own goods, separate from My auctions. */
export function MyGoodsPage() {
  const [goods, setGoods] = useState<Goods[] | null>(null);

  const load = useCallback(() => {
    api<{ goods: Goods[] }>('/me/goods').then((r) => setGoods(r.goods));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="row spread">
        <h1>My goods</h1>
        <Link to="/goods/new" className="btn btn-primary">
          + Add goods
        </Link>
      </div>
      <p className="muted small">Add goods here first; then create an auction for them. Goods you won show as bought and can be auctioned again. Goods in an auction or sold cannot be changed.</p>
      {!goods ? (
        <p className="muted">Loading...</p>
      ) : goods.length === 0 ? (
        <p className="muted">You haven't added any goods yet.</p>
      ) : (
        <div className="table-wrap">
          <table data-testid="my-goods">
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {goods.map((g) => (
                <tr key={g.id} data-testid={`goods-${g.id}`}>
                  <td>{g.images[0] ? <img className="goods-thumb" src={g.images[0]} alt={g.name} /> : <span className="muted small">No image</span>}</td>
                  <td>{g.name}</td>
                  <td>{g.category?.name ?? '-'}</td>
                  <td>{g.condition ? CONDITION_LABELS[g.condition] ?? g.condition : '-'}</td>
                  <td>
                    <GoodsStatusBadge status={g.status} bought={g.bought} />
                    {g.auctionId && g.status !== 'available' && (
                      <>
                        {' '}
                        <Link className="small" to={`/auctions/${g.auctionId}`}>
                          View auction
                        </Link>
                      </>
                    )}
                  </td>
                  <td>
                    <GoodsActions goods={g} onDeleted={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** gds-002: Edit and Delete; both off with the reason shown while the goods are in an auction or sold. */
function GoodsActions({ goods, onDeleted }: { goods: Goods; onDeleted: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (goods.lockedReason) {
    return (
      <div className="row">
        <button className="btn btn-ghost btn-small" disabled aria-label={`Edit ${goods.name}`}>
          Edit
        </button>
        <button className="btn btn-ghost btn-small" disabled aria-label={`Delete ${goods.name}`}>
          Delete
        </button>
        <span className="muted small" data-testid="locked-reason">
          {goods.lockedReason}
        </span>
      </div>
    );
  }

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/goods/${goods.id}`, { method: 'DELETE' });
      toast(res.message, 'success');
      onDeleted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Delete failed', 'error');
      onDeleted();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <span className="row" role="group" aria-label={`Confirm delete ${goods.name}`}>
        <span className="small">Delete {goods.name}?</span>
        <button className="btn btn-danger btn-small" onClick={remove} disabled={busy}>
          Yes, delete
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>
          Keep
        </button>
      </span>
    );
  }
  return (
    <div className="row">
      <Link className="btn btn-primary btn-small" to={`/auctions/new?goodsId=${goods.id}`} aria-label={`Auction ${goods.name}`}>
        Auction it
      </Link>
      <Link className="btn btn-ghost btn-small" to={`/goods/${goods.id}/edit`} aria-label={`Edit ${goods.name}`}>
        Edit
      </Link>
      <button className="btn btn-ghost btn-small" onClick={() => setConfirming(true)} aria-label={`Delete ${goods.name}`}>
        Delete
      </button>
    </div>
  );
}

export const toGoodsBody = (v: GoodsValues) => ({ ...v, categoryId: v.categoryId ? Number(v.categoryId) : '' });

export function AddGoodsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const submit = async (values: GoodsValues) => {
    await api('/goods', { body: toGoodsBody(values) });
    toast('Goods added', 'success');
    navigate('/goods');
  };
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Add goods</h1>
      <GoodsForm initial={EMPTY_GOODS} submitLabel="Add goods" onSubmit={submit} />
    </div>
  );
}

export function EditGoodsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [goods, setGoods] = useState<Goods | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    api<{ goods: Goods }>(`/goods/${id}`)
      .then((r) => setGoods(r.goods))
      .catch((err) => setProblem(err instanceof ApiError ? err.message : 'Could not load the goods'));
  }, [id]);

  const submit = async (values: GoodsValues) => {
    try {
      await api(`/goods/${id}`, { method: 'PATCH', body: toGoodsBody(values) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast(err.message, 'error');
      throw err;
    }
    toast('Goods updated', 'success');
    navigate('/goods');
  };

  if (problem) return <p className="muted">{problem}</p>;
  if (!goods) return <p className="muted">Loading...</p>;
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Edit goods</h1>
      {goods.lockedReason ? (
        <p className="muted">{goods.lockedReason}.</p>
      ) : (
        <GoodsForm
          initial={{
            name: goods.name,
            description: goods.description ?? '',
            categoryId: goods.category ? String(goods.category.id) : '',
            condition: goods.condition ?? '',
            images: goods.images,
          }}
          submitLabel="Save changes"
          onSubmit={submit}
        />
      )}
    </div>
  );
}
