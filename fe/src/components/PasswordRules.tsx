import { PASSWORD_RULES } from '../validate';

/** mail-003: the password conditions, ticked live as the user types. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="password-rules" aria-label="Password rules" data-testid="password-rules">
      {PASSWORD_RULES.map((r) => {
        const met = r.test(value);
        return (
          <li key={r.label} className={met ? 'met' : ''} data-met={met}>
            <span aria-hidden="true">{met ? '✓' : '•'}</span> {r.label}
            <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
