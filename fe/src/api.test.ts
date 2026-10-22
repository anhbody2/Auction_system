import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR, api, http, refreshSession, setUnauthorizedHandler } from './api';

/** Stub adapter: records each request and answers with the given status/body (>= 400 rejects like axios does). */
function stub(status: number, data: unknown = {}) {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    const response = { data, status, statusText: '', headers: {}, config, request: {} };
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    return response;
  };
  http.defaults.adapter = adapter;
  return seen;
}

const original = http.defaults.adapter;
afterEach(() => {
  http.defaults.adapter = original;
});

describe('sys-004 shared axios client', () => {
  it('sends cookies, prefixes /api and returns the JSON body', async () => {
    const seen = stub(200, { user: { id: 1 } });
    await expect(api('/auth/me')).resolves.toEqual({ user: { id: 1 } });
    expect(seen[0].baseURL).toBe('/api');
    expect(seen[0].url).toBe('/auth/me');
    expect(seen[0].withCredentials).toBe(true);
    expect(seen[0].method).toBe('get');
  });

  it('a GET without a body sends no Content-Type; a body is POSTed as JSON', async () => {
    const seen = stub(200);
    await api('/auctions');
    expect(AxiosHeaders.from(seen[0].headers).get('Content-Type')).toBeFalsy();
    await api('/credit/topup', { body: { amount: 5 } });
    expect(seen[1].method).toBe('post');
    expect(String(AxiosHeaders.from(seen[1].headers).get('Content-Type'))).toContain('application/json');
    expect(JSON.parse(seen[1].data)).toEqual({ amount: 5 });
    await api('/goods/1', { method: 'DELETE' });
    expect(seen[2].method).toBe('delete');
  });

  it('a 400 with {error, fields} becomes ApiError with the same status, message and fields', async () => {
    stub(400, { error: 'Validation failed', fields: { name: 'Name must be at least 3 characters' } });
    const err = await api('/goods', { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: 'Validation failed', fields: { name: 'Name must be at least 3 characters' } });
  });

  it('an error without a JSON body still becomes ApiError("Request failed")', async () => {
    stub(500, '');
    await expect(api('/x')).rejects.toMatchObject({ status: 500, message: 'Request failed', fields: {} });
  });

  it('a network error becomes ApiError with a readable message', async () => {
    http.defaults.adapter = async (config) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    };
    const err = await api('/auctions').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: NETWORK_ERROR });
  });

  describe('401 handling', () => {
    const handler = vi.fn();
    let unregister: () => void;
    beforeEach(() => {
      handler.mockReset();
      unregister = setUnauthorizedHandler(handler);
    });
    afterEach(() => unregister());

    it('a 401 on a protected call triggers the unauthorized handler once and still rejects', async () => {
      stub(401, { error: 'Not authenticated' });
      await expect(api('/me/goods')).rejects.toMatchObject({ status: 401, message: 'Not authenticated' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('401s from /auth/* (wrong password, guest probe) and other statuses do not trigger it', async () => {
      stub(401, { error: 'Invalid username/email or password' });
      await expect(api('/auth/login', { body: { identifier: 'x', password: 'y' } })).rejects.toMatchObject({ status: 401 });
      await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });
      stub(403, { error: 'Forbidden' });
      await expect(api('/staff/auctions')).rejects.toMatchObject({ status: 403 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('a retried call that is 401 again signs the user out without a second refresh', async () => {
      const seen = stub(401, {});
      await expect(api('/me/goods')).rejects.toMatchObject({ status: 401 });
      expect(seen.map((c) => c.url)).toEqual(['/me/goods', '/auth/refresh']);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('unregistering removes the handler', async () => {
      unregister();
      stub(401, {});
      await expect(api('/me/goods')).rejects.toBeInstanceOf(ApiError);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('sec-003 refresh on 401', () => {
    const handler = vi.fn();
    let unregister: () => void;
    beforeEach(() => {
      handler.mockReset();
      unregister = setUnauthorizedHandler(handler);
    });
    afterEach(() => unregister());

    /** Answers by URL: /auth/refresh with refreshStatus; other calls 401 until the session is refreshed, then 200. */
    function session(refreshStatus: number) {
      const seen: string[] = [];
      let renewed = false;
      http.defaults.adapter = async (config) => {
        seen.push(config.url!);
        await new Promise((r) => setTimeout(r, 5));
        let status = renewed ? 200 : 401;
        if (config.url === '/auth/refresh') {
          status = refreshStatus;
          renewed = status === 200;
        }
        const response = { data: { url: config.url }, status, statusText: '', headers: {}, config, request: {} };
        if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, {}, response);
        return response;
      };
      return seen;
    }

    it('an expired access cookie is renewed once and the call retried transparently', async () => {
      const seen = session(200);
      await expect(api('/me/goods')).resolves.toEqual({ url: '/me/goods' });
      expect(seen).toEqual(['/me/goods', '/auth/refresh', '/me/goods']);
      expect(handler).not.toHaveBeenCalled();
    });

    it('concurrent 401s share one refresh, and each call is retried', async () => {
      const seen = session(200);
      const results = await Promise.all([api('/me/goods'), api('/credit'), api('/me/auctions')]);
      expect(results.map((r) => (r as { url: string }).url)).toEqual(['/me/goods', '/credit', '/me/auctions']);
      expect(seen.filter((u) => u === '/auth/refresh')).toHaveLength(1);
      expect(seen).toHaveLength(7);
    });

    it('a failed refresh signs the user out and rejects with the original 401', async () => {
      session(401);
      await expect(api('/me/goods')).rejects.toMatchObject({ status: 401 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('login, refresh and logout are never refreshed; /auth/me is (page load after the access cookie expired)', async () => {
      let seen = session(200);
      await expect(api('/auth/login', { body: { identifier: 'x', password: 'y' } })).rejects.toMatchObject({ status: 401 });
      expect(seen).toEqual(['/auth/login']);
      seen = session(401);
      await expect(api('/auth/logout', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
      expect(seen).toEqual(['/auth/logout']);
      seen = session(200);
      await expect(api('/auth/me')).resolves.toEqual({ url: '/auth/me' });
      expect(seen).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
      expect(handler).not.toHaveBeenCalled();
    });

    it('refreshSession resolves true or false and can run again after finishing', async () => {
      session(200);
      await expect(refreshSession()).resolves.toBe(true);
      session(401);
      await expect(refreshSession()).resolves.toBe(false);
    });
  });
});
