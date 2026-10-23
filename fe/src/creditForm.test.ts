import { describe, expect, it } from 'vitest';
import { checkCreditRequest, isCreditMode, parseCreditAmount, quickText, submitLabel } from './creditForm';

describe('ui-3b.1 credit request form', () => {
  it('parses typed amounts with separators; empty or zero is no amount', () => {
    expect(parseCreditAmount('1,000')).toBe(1000);
    expect(parseCreditAmount('120.25')).toBe(120.25);
    expect(parseCreditAmount('')).toBeNull();
    expect(parseCreditAmount('0')).toBeNull();
    expect(parseCreditAmount('abc')).toBeNull();
  });

  it('asks for an amount and refuses withdrawals over available credit', () => {
    expect(checkCreditRequest('topup', '', 0)).toBe('Enter an amount.');
    expect(checkCreditRequest('withdraw', '500', 300)).toBe('Exceeds available credit of $300.00.');
    expect(checkCreditRequest('withdraw', '1,500', 1250.5)).toBe('Exceeds available credit of $1,250.50.');
    expect(checkCreditRequest('withdraw', '300', 300)).toBeNull();
    // Top-ups have no available-credit limit on the client
    expect(checkCreditRequest('topup', '99999', 0)).toBeNull();
  });

  it('labels the submit button with the mode and amount', () => {
    expect(submitLabel('topup', '1,000')).toBe('Request top up $1,000.00');
    expect(submitLabel('withdraw', '120.25')).toBe('Request withdrawal $120.25');
    expect(submitLabel('topup', '')).toBe('Request top up');
  });

  it('fills quick amounts with separators and reads the mode from the URL', () => {
    expect(quickText(10000)).toBe('10,000');
    expect(isCreditMode('withdraw')).toBe(true);
    expect(isCreditMode('deposit')).toBe(false);
  });
});
