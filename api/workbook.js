import { timingSafeEqual } from 'node:crypto'

const validSheets = sheets => Array.isArray(sheets) && sheets.length === 3 &&
  sheets.every(s => typeof s.name === 'string' && Array.isArray(s.headers) &&
    s.headers.every(h => typeof h === 'string') && Array.isArray(s.rows) &&
    s.rows.every(r => typeof r.id === 'string' && Array.isArray(r.values) &&
      r.values.length === s.headers.length && r.values.every(v => typeof v === 'string')))

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const password = process.env.WORKSPACE_PASSWORD
  const key = process.env.SUPABASE_SECRET_KEY
  const base = process.env.SUPABASE_REST_URL || (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '') + '/rest/v1'
  if (!password || !key || !base.startsWith('https://')) return res.status(503).json({ error: 'Configure the Supabase connection and WORKSPACE_PASSWORD in Vercel.' })
  const supplied = Buffer.from(req.headers.authorization || '')
  const expected = Buffer.from('Bearer ' + password)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Enter the workspace password.' })
  const endpoint = base.replace(/\/$/, '') + '/affiliate_workbooks'
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Database request failed')
    return response.status === 204 ? null : response.json()
  }
  try {
    if (req.method === 'GET') {
      const rows = await request(endpoint + '?id=eq.main&select=sheets,revision')
      return res.status(200).json(rows[0] || { sheets: null, revision: 0 })
    }
    const { sheets, revision } = req.body || {}
    if (!validSheets(sheets) || !Number.isSafeInteger(revision) || revision < 0 || JSON.stringify(sheets).length > 3000000) return res.status(400).json({ error: 'Invalid workbook' })
    let rows
    if (revision === 0) {
      rows = await request(endpoint + '?on_conflict=id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ id: 'main', sheets, revision: 1 }),
      })
    } else {
      rows = await request(endpoint + '?id=eq.main&revision=eq.' + revision, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ sheets, revision: revision + 1 }),
      })
    }
    if (!rows.length) return res.status(409).json({ error: 'Someone else saved changes. Export your edits, then reload to get the latest workbook.' })
    return res.status(200).json({ revision: rows[0].revision })
  } catch {
    return res.status(502).json({ error: 'Database unavailable. Check the connection and apply supabase/schema.sql. Your edits have not been saved to the database.' })
  }
}
