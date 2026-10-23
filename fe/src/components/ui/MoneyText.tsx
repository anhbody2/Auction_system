import { money } from '../../api';

/** ui-0.1: an amount in tabular figures; `signed` adds +/- and colours credit steel and debit crimson. */
export function MoneyText({ value, signed, size, testId }: { value: number | null | undefined; signed?: boolean; size?: 'lg' | 'xl'; testId?: string }) {
  const sign = signed && value != null ? (value > 0 ? '+' : value < 0 ? '-' : '') : '';
  const shown = signed && value != null ? money(Math.abs(value)) : money(value);
  const tone = signed && value ? (value > 0 ? 'ui-money-plus' : 'ui-money-minus') : '';
  return (
    <span className={`ui-money ${size ? `ui-money-${size}` : ''} ${tone}`.trim()} data-testid={testId}>
      {sign}
      {shown}
    </span>
  );
}
