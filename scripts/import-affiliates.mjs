import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = (process.env.SUPABASE_REST_URL || (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '') + '/rest/v1').replace(/\/$/, '')
const key = process.env.SUPABASE_SECRET_KEY
if (!key || !base.startsWith('https://')) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')
const sheets = JSON.parse(await fs.readFile(new URL('../supabase/workbook-import.json', import.meta.url), 'utf8'))
const endpoint = base + '/affiliate_workbooks'
const headers = { apikey: key, 'Content-Type': 'application/json' }
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Supabase returned ${response.status}. Run supabase/setup-and-import.sql if the table is missing.`)
  return response.json()
}
const existing = await request(endpoint + '?id=eq.main&select=sheets,revision')
if (!existing.length) {
  await request(endpoint + '?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id: 'main', sheets, revision: 1 }),
  })
}
const stored = await request(endpoint + '?id=eq.main&select=sheets,revision')
assert.equal(stored.length, 1)
assert.deepEqual(stored[0].sheets, sheets, 'Existing workbook differs from the Excel import. Existing data was not overwritten.')
console.log(JSON.stringify({ verified: true, revision: stored[0].revision, totalRows: sheets.reduce((total, sheet) => total + sheet.rows.length, 0), sheets: sheets.map(s => ({ name: s.name, rows: s.rows.length })) }, null, 2))
