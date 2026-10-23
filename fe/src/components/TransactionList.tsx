import { Link } from 'react-router-dom';
import { money } from '../api';
import { typeLabel } from '../transactionTypes';
import { signOf, type Tx } from './TransactionTable';

/**
 * ui-3b.2: the customer's transactions in the 3b layout: date, description with the transaction id under it,
 * type pill, signed amount (+ steel, - crimson) and the balance after it. The staff list keeps TransactionTable.
 */
export function TransactionList({ rows }: { rows: Tx[] }) {
  return (
    <div className="table-wrap">
      <table data-testid="transactions" className="tx-list">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Type</th>
            <th className="num">Amount</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const sign = signOf(t);
            const open = t.status && t.status !== 'posted';
            return (
              <tr key={t.id} data-testid={`tx-${t.id}`}>
                <td className="muted small">{new Date(t.createdAt).toLocaleString()}</td>
                <td>
                  <div className="tx-desc">
                    {t.description}
                    {t.auction && (
                      <>
                        {' · '}
                        <Link to={`/auctions/${t.auction.id}`}>{t.auction.name}</Link>
                      </>
                    )}
                    {t.status === 'rejected' && t.rejectionReason && <span className="muted small"> (rejected: {t.rejectionReason})</span>}
                  </div>
                  <div className="muted small" data-testid="tx-id">
                    #{t.id}
                  </div>
                </td>
                <td>
                  <span className={`ui-pill ui-pill-${t.transactionType === 'withdraw' || t.transactionType === 'payment' ? 'cream' : 'steel'}`} data-testid="tx-type">
                    {typeLabel(t.transactionType)}
                  </span>
                  {open && (
                    <>
                      {' '}
                      <span className="ui-pill ui-pill-muted tx-status" data-testid="tx-status">
                        {t.status}
                      </span>
                    </>
                  )}
                </td>
                <td className={`num ui-money ${sign === '+' ? 'ui-money-plus' : sign === '-' ? 'ui-money-minus' : ''}`}>
                  {sign}
                  {money(t.amount)}
                </td>
                <td className="num">{open ? '-' : money(t.balanceAfter)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
