export type Row = { id: string; values: string[] }
export type Sheet = { name: string; headers: string[]; rows: Row[] }

// GOOD is a live view; keep the stored legacy sheet intact for its historical notes.
export function affiliateViews(sheets: Sheet[]): Sheet[] {
  const current = sheets.find(sheet => sheet.name === 'Current Affiliates')
  if (!current) return sheets
  const quality = current.headers.indexOf('Quality')
  const name = current.headers.indexOf('Name')
  return sheets.map(sheet => sheet.name === 'GOOD' ? {
    ...sheet,
    headers: current.headers,
    rows: current.rows.filter(row => row.values[name]?.trim() && row.values[quality]?.trim().toLowerCase() === 'good'),
  } : sheet)
}

export async function readWorkbookResponse(response: Response) {
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch {
    throw new Error('The database API returned an empty or invalid response. Use the Vercel deployment or run npx vercel dev locally.')
  }
  if (!response.ok) throw new Error(result?.error || `Database request failed (${response.status}).`)
  if (!result || !Number.isSafeInteger(result.revision)) throw new Error('The database API returned an invalid workbook revision.')
  return result as { sheets?: Sheet[] | null; revision: number }
}

export function requireSheets(sheets: unknown): asserts sheets is Sheet[] {
  if (!Array.isArray(sheets) || !['Current Affiliates', 'GOOD', 'BAD REVIEW'].every(name => sheets.some(s => s?.name === name)) ||
    !sheets.every(s => s && typeof s.name === 'string' && Array.isArray(s.headers) && s.headers.every((h: unknown) => typeof h === 'string') && Array.isArray(s.rows) && s.rows.every((r: Row) => r && typeof r.id === 'string' && Array.isArray(r.values) && r.values.length === s.headers.length && r.values.every(v => typeof v === 'string')))) {
    throw new Error('The database has no valid affiliate workbook. Run supabase/setup-and-import.sql in Supabase, then reconnect.')
  }
}
