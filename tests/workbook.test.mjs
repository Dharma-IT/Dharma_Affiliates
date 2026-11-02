import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/workbook.js'

test('Vercel workbook authentication, reads, writes, conflicts and failures', async () => {
  const previous = { ...process.env }
  const originalFetch = globalThis.fetch
  process.env.WORKSPACE_PASSWORD = 'test-password'
  process.env.SUPABASE_SECRET_KEY = 'server-only-test-key'
  process.env.SUPABASE_REST_URL = 'https://example.supabase.co/rest/v1'
  const call = async (method, body, authorization = 'Bearer test-password') => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
    await handler({ method, body, headers: { authorization } }, res)
    return res
  }
  try {
    globalThis.fetch = async () => { throw new Error('Must not access database') }
    assert.equal((await call('GET', null, 'wrong')).code, 401)
    assert.equal((await call('DELETE')).code, 405)
    assert.equal((await call('PUT', { sheets: [], revision: 0 })).code, 400)
    globalThis.fetch = async () => Response.json([])
    assert.deepEqual((await call('GET')).data, { sheets: null, revision: 0 })
    const sheets = ['Current Affiliates', 'GOOD', 'BAD REVIEW'].map(name => ({ name, headers: ['Name'], rows: [{ id: '1', values: ['Example'] }] }))
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.apikey, 'server-only-test-key')
      assert.equal(options.method, 'POST')
      assert.match(url, /on_conflict=id/)
      assert.equal(JSON.parse(options.body).revision, 1)
      return Response.json([{ revision: 1 }])
    }
    assert.deepEqual((await call('PUT', { sheets, revision: 0 })).data, { revision: 1 })
    globalThis.fetch = async (url, options) => {
      assert.match(url, /revision=eq.1/)
      assert.equal(options.method, 'PATCH')
      return Response.json([{ revision: 2 }])
    }
    assert.equal((await call('PUT', { sheets, revision: 1 })).data.revision, 2)
    globalThis.fetch = async () => Response.json([])
    assert.equal((await call('PUT', { sheets, revision: 1 })).code, 409)
    assert.equal((await call('PUT', { sheets, revision: 0 })).code, 409)
    globalThis.fetch = async () => new Response('private database details', { status: 500 })
    const failure = await call('GET')
    assert.equal(failure.code, 502)
    assert.equal(JSON.stringify(failure.data).includes('private database details'), false)
    delete process.env.WORKSPACE_PASSWORD
    assert.equal((await call('GET')).code, 503)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of ['WORKSPACE_PASSWORD', 'SUPABASE_SECRET_KEY', 'SUPABASE_REST_URL']) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
