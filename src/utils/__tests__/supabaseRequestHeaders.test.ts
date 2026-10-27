// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withDefaultHeaders } from '../supabase/requestHeaders';

describe('headers on every Supabase request', () => {
  it('a file upload (FormData) carries no Content-Type, so the browser writes multipart with its boundary', () => {
    const form = new FormData();
    form.append('', new Blob([new Uint8Array(4)], { type: 'image/png' }), 'p.png');
    const headers = withDefaultHeaders({ apikey: 'k', authorization: 'Bearer t', 'x-upsert': 'false' }, form);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('apikey')).toBe('k');
    expect(headers.get('x-upsert')).toBe('false');
  });
  it('...even when something upstream set one: it would have no boundary and would be wrong', () => {
    expect(withDefaultHeaders({ 'Content-Type': 'application/json' }, new FormData()).has('Content-Type')).toBe(false);
  });
  it('a raw binary body is not relabelled as JSON either', () => {
    expect(withDefaultHeaders(undefined, new Blob(['x'], { type: 'image/png' })).has('Content-Type')).toBe(false);
    expect(withDefaultHeaders(undefined, new ArrayBuffer(8)).has('Content-Type')).toBe(false);
    expect(withDefaultHeaders(undefined, new Uint8Array(8)).has('Content-Type')).toBe(false);
    expect(withDefaultHeaders({ 'Content-Type': 'image/png' }, new Blob(['x'])).get('Content-Type')).toBe('image/png');
  });
  it('a JSON request still defaults to application/json, and an explicit type is kept', () => {
    expect(withDefaultHeaders(undefined, JSON.stringify({ a: 1 })).get('Content-Type')).toBe('application/json');
    expect(withDefaultHeaders(undefined, undefined).get('Content-Type')).toBe('application/json');
    expect(withDefaultHeaders({ 'Content-Type': 'application/vnd.pgrst.object+json' }, '{}').get('Content-Type')).toBe('application/vnd.pgrst.object+json');
  });
  it('Accept is always JSON and a Headers instance (what supabase-js passes) keeps its apikey and authorization', () => {
    const incoming = new Headers({ apikey: 'k', Authorization: 'Bearer t' });
    const headers = withDefaultHeaders(incoming, '{}');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('apikey')).toBe('k');
    expect(headers.get('authorization')).toBe('Bearer t');
  });
  it('the client uses it, so there is no second place that forces JSON', () => {
    const client = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'client.tsx'), 'utf8');
    expect(client).toContain("import { withDefaultHeaders } from './requestHeaders'");
    expect(client).toContain('withDefaultHeaders(options.headers');
    expect(client).not.toMatch(/mergedHeaders\.set\('Content-Type', 'application\/json'\)/);
  });
});
