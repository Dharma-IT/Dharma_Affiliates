const validSheets = sheets => Array.isArray(sheets) && sheets.length >= 3 &&
  ['Current Affiliates', 'GOOD', 'BAD REVIEW'].every(name => sheets.some(s => s?.name === name)) &&
  new Set(sheets.map(s => s?.name)).size === sheets.length &&
  sheets.every(s => s && typeof s.name === 'string' && Array.isArray(s.headers) &&
    s.headers.every(h => typeof h === 'string') && Array.isArray(s.rows) &&
    s.rows.every(r => r && typeof r.id === 'string' && Array.isArray(r.values) &&
      r.values.length === s.headers.length && r.values.every(v => typeof v === 'string')))

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const key = process.env.SUPABASE_SECRET_KEY
  const base = process.env.SUPABASE_REST_URL || (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '') + '/rest/v1'
  if (!key || !base.startsWith('https://')) return res.status(503).json({ error: 'Configure the Supabase connection in Vercel.' })
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) return res.status(401).json({ error: 'Sign in to access the workspace.' })
  // Validate with Supabase Auth on every request. Never trust a decoded JWT or
  // browser-supplied user ID when using the privileged database key below.
  try {
    const auth = await fetch(new URL('/auth/v1/user', base), {
      headers: { apikey: key, Authorization: authorization }, signal: AbortSignal.timeout(15000),
    })
    if (auth.status === 401 || auth.status === 403) return res.status(401).json({ error: 'Your session has expired. Sign in again.' })
    if (!auth.ok) throw new Error('Auth unavailable')
    const user = await auth.json()
    if (!user.id || user.is_anonymous || !user.email_confirmed_at) return res.status(403).json({ error: 'A verified workspace account is required.' })
    const allowed = (process.env.AFFILIATE_ALLOWED_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    if (allowed.length && !allowed.includes(user.email?.toLowerCase())) return res.status(403).json({ error: 'Your account does not have access to the affiliate workspace.' })
  } catch {
    return res.status(503).json({ error: 'Unable to verify your session. Please try again.' })
  }
  const endpoint = base.replace(/\/$/, '') + '/affiliate_workbooks'
  const headers = { apikey: key, 'Content-Type': 'application/json' }
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Database request failed')
    const body = await response.text()
    if (!body.trim()) throw new Error('Empty database response')
    const data = JSON.parse(body)
    if (!Array.isArray(data)) throw new Error('Unexpected database response')
    return data
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
