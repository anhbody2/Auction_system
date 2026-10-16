import { z } from 'zod';

export const emailField = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);
export const usernameField = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username must be 3-30 letters, numbers or underscores');
export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');
export const fullNameField = z.string().trim().min(2, 'Full name is required').max(255);
export const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');
export const moneyField = z.coerce
  .number({ invalid_type_error: 'Enter a valid amount' })
  .positive('Amount must be greater than 0')
  .max(1_000_000_000, 'Amount is too large')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places');
