import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../api';

export interface Tx {
  id: number;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
  auction: { id: number; name: string } | null;
}

/** trx-001: one page of search results. */
export interface TxPage<T extends Tx = Tx> {
  transactions: T[];
  total: number;
  page: number;
  pageSize: number;
  from: string;
  to: string;
}

export const SIGN: Record<string, string> = { topup: '+', payout: '+', release: '+', withdraw: '-', hold: '-', payment: '-' };

/** Ledger table; `extraColumns` lets the staff list add customer / status / actions columns. */
export function TransactionTable<T extends Tx>({
  rows,
  extraColumns = [],
}: {
  rows: T[];
  extraColumns?: { header: string; cell: (t: T) => ReactNode }[];
}) {
  return (
    <div className="table-wrap">
      <table data-testid="transactions">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Type</th>
            <th>Details</th>
            <th>Amount</th>
            <th>Credit after</th>
            {extraColumns.map((c) => (
              <th key={c.header}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} data-testid={`tx-${t.id}`}>
              <td>{t.id}</td>
              <td>{new Date(t.createdAt).toLocaleString()}</td>
              <td>
                <span className="badge">{t.transactionType}</span>
              </td>
              <td>
                {t.description}
                {t.auction && (
                  <>
                    {' · '}
                    <Link to={`/auctions/${t.auction.id}`}>{t.auction.name}</Link>
                  </>
                )}
              </td>
              <td>
                {SIGN[t.transactionType] ?? ''}
                {money(t.amount)}
              </td>
              <td>{money(t.balanceAfter)}</td>
              {extraColumns.map((c) => (
                <td key={c.header}>{c.cell(t)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  noun = ['transaction', 'transactions'],
  testId = 'tx-total',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  /** Singular and plural for the total, e.g. ['item', 'items']. */
  noun?: [string, string];
  testId?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="row spread pager">
      <span className="muted small" data-testid={testId}>
        {total} {total === 1 ? noun[0] : noun[1]} · page {page} of {pages}
      </span>
      <span className="row">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
