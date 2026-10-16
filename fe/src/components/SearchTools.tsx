import { useState, type FormEvent } from 'react';

export type SearchField = 'all' | 'seller' | 'auction' | 'category' | 'product';
export interface Search {
  q: string;
  field: SearchField;
}

export const FIELD_LABELS: Record<SearchField, string> = {
  all: 'Everything',
  seller: 'Seller name',
  auction: 'Auction',
  category: 'Category',
  product: 'Product',
};

export function SearchTools({ value, onSearch }: { value: Search; onSearch: (s: Search) => void }) {
  const [open, setOpen] = useState(!!value.q);
  const [q, setQ] = useState(value.q);
  const [field, setField] = useState<SearchField>(value.field);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch({ q: q.trim(), field });
  };
  const clear = () => {
    setQ('');
    setField('all');
    onSearch({ q: '', field: 'all' });
  };

  return (
    <div className="search-tools">
      <button className="btn btn-ghost" aria-expanded={open} aria-controls="search-panel" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide search' : 'Search auctions'}
      </button>
      {open && (
        <form id="search-panel" className="card search-panel" role="search" onSubmit={submit}>
          <div className="field grow">
            <label htmlFor="search-q">Keywords</label>
            <input id="search-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. camera, alice, Electronics" />
          </div>
          <div className="field">
            <label htmlFor="search-field">Search in</label>
            <select id="search-field" value={field} onChange={(e) => setField(e.target.value as SearchField)}>
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit">
              Search
            </button>
            {value.q && (
              <button className="btn btn-ghost" type="button" onClick={clear}>
                Clear
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
