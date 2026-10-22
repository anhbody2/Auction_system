/**
 * mail-004: the check-mail screen shows where the link went without printing the whole address:
 * first letter of the local part, then one '*' per hidden letter; the domain stays readable.
 */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}${email.slice(at)}`;
}
