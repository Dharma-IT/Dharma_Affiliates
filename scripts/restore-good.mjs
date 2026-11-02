import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

// Screenshot row order, explicitly selected by the user. Values come from
// matching Current Affiliates records rather than invented contact details.
const names = [
  'Abigail Villars', 'Aliuska Avalos', 'Ana Núñez', 'Ana Santizo',
  'Andre Mejia', 'Antonietta Petruzzelli', 'Araceli Martinez',
  'Camari Skin Salazar', 'Carol Sigaran', 'Daniela Quesadas', 'Delmy Torres',
  'Deyanira', 'Doris Ramírez', 'erika Montano Sosa', 'Esteban Pérez',
  'Francisca Mendoza', 'Fransisca Beto', 'Gabriel Gonzalez',
  'Gabriela Velásquez', 'gladis Argueta', 'Glenda Figueroa', 'Grace Gutierrez',
  'Jose Navarro', 'Karen Pascual', 'Karla Guerrero', 'Karol Martinez',
  'Lislye Hernandez', 'Lissette Abad Ramo', 'Lucina Zamora',
  'Maria Cristina Bravo', 'Maria Membreno', 'Marisela Saracay', 'Marlene Reyes',
  'Mireya Bazan', 'Nancy Ponce', 'Nubia Paz', 'Oriana Barreto Solorza',
  'Reina Escobar', 'Tamara Velez', 'Yanci Alvarado Díaz', 'Yoselin Servellon',
]
const clean = value => value.replace(/[\u202a-\u202e\u2066-\u2069]/g, '').trim()
const normalize = value => clean(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const base = (process.env.SUPABASE_REST_URL || (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '') + '/rest/v1').replace(/\/$/, '')
const key = process.env.SUPABASE_SECRET_KEY
if (!key || !base.startsWith('https://')) throw new Error('Configure the Supabase server environment first.')
const endpoint = base + '/affiliate_workbooks'
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { apikey: key, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`)
  return response.json()
}
const [workbook] = await request(endpoint + '?id=eq.main&select=sheets,revision')
assert.ok(workbook, 'Import the Excel workbook before restoring GOOD.')
const current = workbook.sheets.find(s => s.name === 'Current Affiliates')
const index = workbook.sheets.findIndex(s => s.name === 'GOOD')
assert.ok(current && index >= 0, 'Required sheets are missing.')
const headers = ['Name', 'Phone', 'GMV $ - Last 30 days', 'Status']
const columns = headers.map(h => current.headers.indexOf(h))
assert.ok(columns.every(i => i >= 0))
const rows = names.map(name => {
  const matches = current.rows.filter(r => normalize(r.values[columns[0]]) === normalize(name))
  assert.equal(matches.length, 1, `Expected one source record for ${name}`)
  const source = matches[0]
  const hash = createHash('sha256').update('dharma/GOOD/' + source.id).digest('hex')
  return {
    id: `good-${hash.slice(0, 24)}`,
    values: columns.map(i => clean(source.values[i] || '')),
    sourceRecord: { sheet: current.name, id: source.id },
  }
})
const good = {
  name: 'GOOD', headers, rows,
  source: {
    kind: 'screenshot-reconstruction',
    description: 'Membership and row order reconstructed from the user-provided GOOD screenshot. Names, phones, GMV and statuses copied from matching Current Affiliates records. Values may reflect the Excel snapshot rather than screenshot formatting.',
  },
}
assert.equal(new Set(rows.map(r => r.id)).size, names.length)
const existing = workbook.sheets[index]
const alreadyRestored = isDeepStrictEqual(existing, good)
assert.ok(existing.rows.length === 0 || alreadyRestored, 'GOOD already contains data. Refusing to replace existing edits.')

// A standalone migration for other Supabase environments; never replaces a
// nonempty GOOD tab or any other sheet. Bumps revision to reject stale clients.
const payload = JSON.stringify(good)
assert.ok(!payload.includes('$good_import$'))
await fs.writeFile(new URL('../supabase/good-reconstruction.json', import.meta.url), JSON.stringify(good, null, 2) + '\n')
await fs.writeFile(new URL('../supabase/restore-good.sql', import.meta.url), `-- Restore ${rows.length} GOOD records from screenshot membership and existing affiliate data.
-- Run AFTER setup-and-import.sql. Existing nonempty GOOD data is preserved.
begin;
update public.affiliate_workbooks as workbook
set sheets = jsonb_set(workbook.sheets,
    array[(select (ordinality - 1)::text
      from jsonb_array_elements(workbook.sheets) with ordinality as entry(sheet, ordinality)
      where sheet->>'name' = 'GOOD')],
    $good_import$${payload}$good_import$::jsonb),
    revision = workbook.revision + 1
where workbook.id = 'main'
  and exists (select 1 from jsonb_array_elements(workbook.sheets) as entry(sheet)
    where sheet->>'name' = 'GOOD' and jsonb_array_length(sheet->'rows') = 0);
commit;

select jsonb_array_length(sheet->'rows') as good_records
from public.affiliate_workbooks, jsonb_array_elements(sheets) as entry(sheet)
where id = 'main' and sheet->>'name' = 'GOOD';
`)

const expected = structuredClone(workbook.sheets)
expected[index] = good
if (!alreadyRestored) {
  const updated = await request(endpoint + '?id=eq.main&revision=eq.' + workbook.revision, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ sheets: expected, revision: workbook.revision + 1 }),
  })
  assert.equal(updated.length, 1, 'Workbook changed concurrently. Rerun against the latest data.')
}
const [verified] = await request(endpoint + '?id=eq.main&select=sheets,revision')
assert.deepEqual(verified.sheets, expected, 'Saved workbook differs from expected reconstruction.')
console.log(JSON.stringify({ verified: true, revision: verified.revision, goodRows: rows.length, totalRows: verified.sheets.reduce((n, s) => n + s.rows.length, 0), otherSheetsPreserved: true }, null, 2))
