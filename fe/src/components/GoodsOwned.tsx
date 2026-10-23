import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, type Goods } from '../api';
import { Card } from './ui';

type OwnedGoods = Goods & { wonPrice: number | null; wonAt: string | null };

/** ui-2a.2: up to this many owned goods on the dashboard; the rest are on My goods. */
const SHOWN = 5;

/**
 * ui-2a.2: 'Goods owned' on the dashboard: goods the user won and still owns, with the winning price and date.
 * 'Sell' opens Create auction with the item preselected; items already in an auction read 'Listed'.
 */
export function GoodsOwned() {
  const [goods, setGoods] = useState<OwnedGoods[] | null>(null);
  const load = useCallback(() => {
    api<{ goods: OwnedGoods[] }>('/me/goods/owned').then((r) => setGoods(r.goods));
  }, []);
  useEffect(load, [load]);

  return (
    <Card
      title={
        <>
          Goods owned <span className="muted small">{goods ? `· ${goods.length}` : ''}</span>
        </>
      }
      actions={
        goods && goods.length > SHOWN ? (
          <Link to="/goods" className="small">
            View all
          </Link>
        ) : null
      }
      testId="goods-owned"
    >
      {!goods ? (
        <p className="muted">Loading...</p>
      ) : goods.length === 0 ? (
        <p className="muted" data-testid="goods-owned-empty">
          Nothing won yet. <Link to="/">Browse lots</Link>
        </p>
      ) : (
        <ul className="owned-list">
          {goods.slice(0, SHOWN).map((g) => (
            <li key={g.id} className="owned-item" data-testid={`owned-${g.id}`}>
              {g.images[0] ? <img src={g.images[0]} alt="" className="owned-thumb" /> : <span className="owned-thumb lot-thumb-empty" aria-hidden="true" />}
              <div className="owned-text">
                <div className="owned-name">{g.name}</div>
                <div className="muted small">
                  Won {money(g.wonPrice)}
                  {g.wonAt && ` · ${new Date(g.wonAt).toLocaleDateString()}`}
                </div>
              </div>
              {g.status === 'in_auction' ? (
                <span className="ui-pill ui-pill-steel" data-testid="owned-listed">
                  Listed
                </span>
              ) : g.status === 'available' ? (
                <Link to={`/auctions/new?goodsId=${g.id}`} className="btn btn-primary btn-small" data-testid="owned-sell">
                  Sell
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
