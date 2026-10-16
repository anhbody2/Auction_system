// Client-side mirrors of be/src/lib/validation.ts. The server stays authoritative.
export type Rule = (value: string, all: Record<string, string>) => string | undefined;

export const required =
  (msg = 'This field is required'): Rule =>
  (v) =>
    v.trim() ? undefined : msg;

export const rules = {
  fullName: [required('Full name is required'), (v: string) => (v.trim().length >= 2 ? undefined : 'Full name is required')],
  username: [
    required('Username is required'),
    (v: string) => (/^[a-zA-Z0-9_]{3,30}$/.test(v.trim()) ? undefined : 'Username must be 3-30 letters, numbers or underscores'),
  ],
  email: [required('Email is required'), (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? undefined : 'Enter a valid email address')],
  phone: [required('Phone is required'), (v: string) => (/^\+?[0-9 ()-]{7,20}$/.test(v.trim()) ? undefined : 'Enter a valid phone number')],
  password: [
    (v: string) => (v.length >= 8 ? undefined : 'Password must be at least 8 characters'),
    (v: string) => (/[A-Za-z]/.test(v) ? undefined : 'Password must contain a letter'),
    (v: string) => (/[0-9]/.test(v) ? undefined : 'Password must contain a number'),
  ],
  confirmPassword: [(v: string, all: Record<string, string>) => (v === all.password && v ? undefined : 'Passwords do not match')],
} satisfies Record<string, Rule[]>;

export function validate(values: Record<string, string>, schema: Record<string, Rule[]>) {
  const errors: Record<string, string> = {};
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const msg = rule(values[field] ?? '', values);
      if (msg) {
        errors[field] = msg;
        break;
      }
    }
  }
  return errors;
}
