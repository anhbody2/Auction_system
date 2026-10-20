import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONDITION_LABELS, GOODS_STATUS_LABELS, api, type Goods } from '../api';
import { EMPTY_GOODS, GoodsForm, type GoodsValues } from '../components/GoodsForm';
import { useToast } from '../toast';

export function GoodsStatusBadge({ status }: { status: Goods['status'] }) {
  return (
    <span className={`badge badge-${status}`} data-testid="goods-status">
      {GOODS_STATUS_LABELS[status]}
    </span>
  );
}

/** Seller - Manage Goods (gds-001): the seller's own goods, separate from My auctions. */
export function MyGoodsPage() {
  const [goods, setGoods] = useState<Goods[] | null>(null);

  useEffect(() => {
    api<{ goods: Goods[] }>('/me/goods').then((r) => setGoods(r.goods));
  }, []);

  return (
    <div>
      <div className="row spread">
        <h1>My goods</h1>
        <Link to="/goods/new" className="btn btn-primary">
          + Add goods
        </Link>
      </div>
      <p className="muted small">Add goods here first; then create an auction for them. Goods in an auction or sold cannot be changed.</p>
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
                    <GoodsStatusBadge status={g.status} />
                    {g.auctionId && g.status !== 'available' && (
                      <>
                        {' '}
                        <Link className="small" to={`/auctions/${g.auctionId}`}>
                          View auction
                        </Link>
                      </>
                    )}
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
