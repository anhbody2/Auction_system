import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { getOutbox } from '../src/lib/mailer';
import { app, resetDb } from './helpers';

const valid = {
  fullName: 'Dave Newman',
  username: 'dave_n',
  email: 'Dave@Example.com',
  phone: '+84 912 345 678',
  address: '1 Main St',
  password: 'Secret123',
  confirmPassword: 'Secret123',
};

describe('guest-001 register', () => {
  beforeAll(resetDb);

  it('rejects invalid fields with a message per field', async () => {
    const res = await request(app).post('/api/auth/register').send({
      fullName: '',
      username: 'a',
      email: 'not-an-email',
      phone: 'abc',
      password: 'short',
      confirmPassword: 'different',
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['confirmPassword', 'email', 'fullName', 'password', 'phone', 'username']);
  });

  it('rejects mismatched password confirmation', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...valid, confirmPassword: 'Other1234' });
    expect(res.status).toBe(400);
    expect(res.body.fields.confirmPassword).toBe('Passwords do not match');
  });

  it('creates the account, sends a confirmation email, and the link verifies it', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'dave_n', email: 'dave@example.com', emailVerified: false });

    const mails = getOutbox('dave@example.com');
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe('Confirm your BidHouse account');
    const token = mails[0].text.match(/token=([a-f0-9]+)/)![1];

    const verify = await request(app).post('/api/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    const reuse = await request(app).post('/api/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);

    const login = await request(app).post('/api/auth/login').send({ identifier: 'dave_n', password: 'Secret123' });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true);
  });

  it('rejects duplicate email and username', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.fields).toEqual({ email: 'Email is already registered', username: 'Username is already taken' });
  });
});
