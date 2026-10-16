import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string;
  name: string;
  error?: string;
  multiline?: boolean;
}

export function Field({ label, name, error, multiline, ...rest }: Props) {
  const errorId = `${name}-error`;
  const common = {
    id: name,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {multiline ? (
        <textarea rows={3} {...common} {...(rest as InputHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...common} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
