import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readWorkbookResponse, requireSheets } from '../src/lib/workbook.ts'

test('empty, HTML and unsuccessful API responses produce useful errors', async () => {
  await assert.rejects(readWorkbookResponse(new Response('')), /Vercel/)
  await assert.rejects(readWorkbookResponse(new Response('<!doctype html>')), /Vercel/)
  await assert.rejects(readWorkbookResponse(Response.json({ error: 'Enter the workspace password.' }, { status: 401 })), /password/)
  await assert.rejects(readWorkbookResponse(Response.json({ revision: '1' })), /revision/)
  assert.throws(() => requireSheets(null), /setup-and-import.sql/)
})

test('all imported sheets are accepted and cells remain aligned with headers', async () => {
  const { readFile } = await import('node:fs/promises')
  const sheets = JSON.parse(await readFile(new URL('../supabase/workbook-import.json', import.meta.url), 'utf8'))
  requireSheets(sheets)
  assert.equal(sheets.length, 9)
  assert.equal(sheets.reduce((n, s) => n + s.rows.length, 0), 585)
  assert.equal(sheets.find(s => s.name === 'Samples').rows[0].sourceRow, 1)
  assert.equal(sheets.find(s => s.name === 'GOOD').rows.length, 0)
  assert.deepEqual(await readWorkbookResponse(Response.json({ sheets, revision: 1 })), { sheets, revision: 1 })
})
