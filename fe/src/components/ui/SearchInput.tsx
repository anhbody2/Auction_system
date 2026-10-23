/** ui-0.1: search box with a magnifier icon. */
export function SearchInput({ value, onChange, placeholder = 'Search', label, testId, name }: { value: string; onChange: (value: string) => void; placeholder?: string; label: string; testId?: string; name?: string }) {
  return (
    <label className="ui-search">
      <span className="sr-only">{label}</span>
      <svg className="ui-search-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <input type="search" name={name} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </label>
  );
}
