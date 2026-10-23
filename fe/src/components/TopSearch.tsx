import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FIELD_LABELS, browseParams, readBrowse, type SearchField } from '../browseQuery';

/**
 * ui-1a.2: the keyword search, moved from the home page into the top bar. Searching from the home page keeps
 * the chosen category chip and sort; from any other page it opens the home page with just the search.
 */
export function TopSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const onHome = location.pathname === '/';
  const current = readBrowse(new URLSearchParams(onHome ? location.search : ''));
  const [q, setQ] = useState(current.q);
  const [field, setField] = useState<SearchField>(current.field);
  // Follow the URL (Back/Forward, Clear, leaving the home page).
  useEffect(() => {
    setQ(current.q);
    setField(current.field);
  }, [current.q, current.field]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { ...current, q: q.trim(), field };
    navigate({ pathname: '/', search: `?${new URLSearchParams(browseParams(onHome ? next : { q: next.q, field, category: '', sort: '' }))}` });
  };

  return (
    <form className="top-search" role="search" onSubmit={submit} data-testid="top-search">
      <label className="ui-search top-search-input">
        <span className="sr-only">Keywords</span>
        <svg className="ui-search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lots, sellers, categories" />
      </label>
      {/* aria-label, not a wrapping <label>: a wrapper would fold the option texts into the accessible name. */}
      <span className="top-search-field">
        <select aria-label="Search in" value={field} onChange={(e) => setField(e.target.value as SearchField)}>
          {Object.entries(FIELD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </span>
      <button type="submit" className="btn btn-primary top-search-go">
        Search
      </button>
    </form>
  );
}
