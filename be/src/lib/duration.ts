import { z } from 'zod';

/** sell-004: an auction lasts from 1 hour to 30 days; the seller picks a number and a unit. */
export const DURATION_UNITS = ['hours', 'days'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export const MIN_DURATION_MINUTES = 60;
export const MAX_DURATION_MINUTES = 30 * 24 * 60;
export const DURATION_MESSAGE = 'Duration must be between 1 hour and 30 days';

const MINUTES_PER: Record<DurationUnit, number> = { hours: 60, days: 24 * 60 };

/** {value, unit} -> whole minutes; null when it is not a whole number of hours/days within 1 hour - 30 days. */
export function durationToMinutes(d: { value: number; unit: DurationUnit }): number | null {
  if (!Number.isInteger(d.value) || !(d.unit in MINUTES_PER)) return null;
  const minutes = d.value * MINUTES_PER[d.unit];
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

/** Parses `duration: { value, unit }` straight to minutes, with one message for every bad input. */
export const durationField = z
  .object(
    {
      value: z.coerce.number({ errorMap: () => ({ message: DURATION_MESSAGE }) }),
      unit: z.enum(DURATION_UNITS, { errorMap: () => ({ message: 'Choose hours or days' }) }),
    },
    { errorMap: () => ({ message: 'Choose a duration' }) },
  )
  .transform((d, ctx) => {
    const minutes = durationToMinutes(d);
    if (minutes === null) {
      ctx.addIssue({ code: 'custom', message: DURATION_MESSAGE });
      return z.NEVER;
    }
    return minutes;
  });
