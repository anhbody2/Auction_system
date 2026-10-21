import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, rules, validate } from './validate';

// The server rules (be/src/lib/validation.ts passwordField) are the source of truth.
const serverSource = readFileSync(resolve(__dirname, '../../be/src/lib/validation.ts'), 'utf8');
const serverPassword = serverSource.slice(serverSource.indexOf('export const passwordField'), serverSource.indexOf(';', serverSource.indexOf('export const passwordField')));

describe('mail-003 client password rules match the server', () => {
  it('every client message is one of passwordField messages, and there are as many', () => {
    const serverMessages = [...serverPassword.matchAll(/'(Password must [^']+)'/g)].map((m) => m[1]);
    expect(serverMessages).toHaveLength(3);
    expect(PASSWORD_RULES.map((r) => r.message).sort()).toEqual(serverMessages.sort());
  });

  it('each weak password gets the expected message; a valid one passes', () => {
    const check = (v: string) => validate({ password: v }, { password: rules.password }).password;
    expect(check('short1')).toBe('Password must be at least 8 characters');
    expect(check('abcdefghij')).toBe('Password must contain a number');
    expect(check('1234567890')).toBe('Password must contain a letter');
    expect(check('Brandnew42')).toBeUndefined();
  });

  it('the checklist ticks each rule on its own', () => {
    expect(PASSWORD_RULES.map((r) => r.test('abc'))).toEqual([false, true, false]);
    expect(PASSWORD_RULES.map((r) => r.test('abcdefg1'))).toEqual([true, true, true]);
  });
});
