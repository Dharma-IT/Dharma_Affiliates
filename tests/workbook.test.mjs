import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/workbook.js'

test('Vercel workbook authentication, reads, writes, conflicts and failures', async () => {
  const previous = { ...process.env }
  const originalFetch = globalThis.fetch
  process.env.SUPABASE_SECRET_KEY = 'server-only-test-key'
  process.env.SUPABASE_REST_URL = 'https://example.supabase.co/rest/v1'
  let databaseFetch
  let authStatus = 200
  let authUser = { id: 'verified-user', email: 'admin@dharma.com', email_confirmed_at: '2026-01-01', is_anonymous: false }
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer valid-user-token')
      return Response.json(authUser, { status: authStatus })
    }
    return databaseFetch(url, options)
  }
  const call = async (method, body, authorization = 'Bearer valid-user-token') => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
    await handler({ method, body, headers: { authorization } }, res)
    return res
  }
  try {
    databaseFetch = async () => { throw new Error('Must not access database') }
    assert.equal((await call('GET', null, 'wrong')).code, 401)
    assert.equal((await call('DELETE')).code, 405)
    assert.equal((await call('PUT', { sheets: [], revision: 0 })).code, 400)
    assert.equal((await call('PUT', { sheets: [null, null, null], revision: 0 })).code, 400)
    databaseFetch = async () => Response.json([])
    assert.deepEqual((await call('GET')).data, { sheets: null, revision: 0 })
    const sheets = ['Current Affiliates', 'GOOD', 'BAD REVIEW'].map(name => ({ name, headers: ['Name'], rows: [{ id: '1', values: ['Example'] }] }))
    databaseFetch = async (url, options) => {
      assert.equal(options.headers.apikey, 'server-only-test-key')
      assert.equal(options.method, 'POST')
      assert.match(url, /on_conflict=id/)
      assert.equal(JSON.parse(options.body).revision, 1)
      return Response.json([{ revision: 1 }])
    }
    assert.deepEqual((await call('PUT', { sheets, revision: 0 })).data, { revision: 1 })
    databaseFetch = async (url, options) => {
      assert.match(url, /revision=eq.1/)
      assert.equal(options.method, 'PATCH')
      return Response.json([{ revision: 2 }])
    }
    assert.equal((await call('PUT', { sheets, revision: 1 })).data.revision, 2)
    const extended = [...sheets, ...Array.from({ length: 6 }, (_, i) => ({ name: `Additional sheet ${i}`, headers: ['Name'], rows: [] }))]
    assert.equal((await call('PUT', { sheets: extended, revision: 1 })).code, 200)
    databaseFetch = async () => Response.json([])
    assert.equal((await call('PUT', { sheets, revision: 1 })).code, 409)
    assert.equal((await call('PUT', { sheets, revision: 0 })).code, 409)
    databaseFetch = async () => new Response('private database details', { status: 500 })
    const failure = await call('GET')
    assert.equal(failure.code, 502)
    assert.equal(JSON.stringify(failure.data).includes('private database details'), false)
    databaseFetch = async () => new Response('', { status: 200 })
    assert.equal((await call('GET')).code, 502)
    authStatus = 401
    assert.equal((await call('GET')).code, 401)
    authStatus = 200
    authUser = { ...authUser, is_anonymous: true }
    assert.equal((await call('GET')).code, 403)
    authUser = { ...authUser, is_anonymous: false }
    process.env.AFFILIATE_ALLOWED_EMAILS = 'other@dharma.com'
    assert.equal((await call('GET')).code, 403)
    delete process.env.AFFILIATE_ALLOWED_EMAILS
    authStatus = 500
    assert.equal((await call('GET')).code, 503)
    authStatus = 200
    delete process.env.SUPABASE_SECRET_KEY
    assert.equal((await call('GET')).code, 503)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of ['AFFILIATE_ALLOWED_EMAILS', 'SUPABASE_SECRET_KEY', 'SUPABASE_REST_URL']) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
