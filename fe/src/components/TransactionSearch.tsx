import { useState, type FormEvent, type ReactNode } from 'react';
import {
  defaultFilter,
  earliestDay,
  localDay,
  validateTransactionFilter,
  type FilterErrors,
  type TransactionFilterValues,
} from '../transactionSearch';

interface Props {
  /** Server field errors from the last search, shown under the fields. */
  serverErrors?: FilterErrors;
  onSearch: (values: TransactionFilterValues) => void;
  /** Extra filters rendered before the buttons (stf-008 adds customer and status). */
  children?: ReactNode;
  /** Called by Clear, after the fields reset, so callers can reset their extra filters. */
  onClear?: () => void;
}

/**
 * trx-001: one search bar for transactions. All fields apply together; dates cannot go further back
 * than 30 days; min amount >= $1 and a blank max means no upper limit.
 */
export function TransactionSearch({ serverErrors = {}, onSearch, children, onClear }: Props) {
  const today = new Date();
  const [values, setValues] = useState<TransactionFilterValues>(() => defaultFilter(today));
  const [errors, setErrors] = useState<FilterErrors>({});
  const shown = { ...serverErrors, ...errors };

  const set = (k: keyof TransactionFilterValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateTransactionFilter(values, new Date());
    setErrors(found);
    if (Object.keys(found).length === 0) onSearch(values);
  };

  const clear = () => {
    const fresh = defaultFilter(new Date());
    setValues(fresh);
    setErrors({});
    onClear?.();
    onSearch(fresh);
  };

  const field = (k: keyof TransactionFilterValues, label: string, input: ReactNode) => (
    <div className="field">
      <label htmlFor={`trx-${k}`}>{label}</label>
      {input}
      {shown[k] && (
        <span className="field-error" role="alert" id={`trx-${k}-error`}>
          {shown[k]}
        </span>
      )}
    </div>
  );
  const common = (k: keyof TransactionFilterValues) => ({
    id: `trx-${k}`,
    name: k,
    value: values[k],
    onChange: set(k),
    'aria-invalid': shown[k] ? true : undefined,
    'aria-describedby': shown[k] ? `trx-${k}-error` : undefined,
  });

  return (
    <form className="card filters trx-search" onSubmit={submit} noValidate role="search" aria-label="Search transactions">
      {field('from', 'From', <input type="date" min={earliestDay(today)} max={localDay(today)} {...common('from')} />)}
      {field('to', 'To', <input type="date" min={earliestDay(today)} max={localDay(today)} {...common('to')} />)}
      {field('name', 'Name', <input placeholder="Auction or description" {...common('name')} />)}
      {field('id', 'Transaction ID', <input inputMode="numeric" {...common('id')} />)}
      {field('min', 'Min amount', <input inputMode="decimal" placeholder="1.00" {...common('min')} />)}
      {field('max', 'Max amount', <input inputMode="decimal" placeholder="No limit" {...common('max')} />)}
      {children}
      <div className="row trx-actions">
        <button className="btn btn-primary" type="submit">
          Search
        </button>
        <button className="btn btn-ghost" type="button" onClick={clear}>
          Clear
        </button>
      </div>
    </form>
  );
}
