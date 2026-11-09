import { test } from 'node:test'
import assert from 'node:assert/strict'
import { affiliateViews } from '../src/lib/workbook.ts'

test('Good reflects current quality and all details, including newly added affiliates', () => {
  const current = { name: 'Current Affiliates', headers: ['Name', 'Phone', 'Quality'], rows: [
    { id: '1', values: ['Ana', '123', 'Good'] },
    { id: '2', values: ['Bea', '456', 'Medium'] },
  ] }
  const legacy = { name: 'GOOD', headers: ['Name', 'Status'], rows: [{ id: 'old', values: ['Old', 'Keep notes'] }] }
  const sheets = [current, legacy, { name: 'BAD REVIEW', headers: [], rows: [] }]
  const view = () => affiliateViews(sheets)[1]
  assert.deepEqual(view().headers, current.headers)
  assert.deepEqual(view().rows, [current.rows[0]])
  current.rows.push({ id: '3', values: ['Cara', '789', ' good '] })
  current.rows.push({ id: '4', values: ['   ', '000', 'Good'] })
  assert.deepEqual(view().rows.map(r => r.id), ['1', '3'])
  current.rows[0].values[1] = 'updated phone'
  assert.equal(view().rows[0].values[1], 'updated phone')
  current.rows[0].values[2] = 'Low'
  assert.deepEqual(view().rows.map(r => r.id), ['3'])
  current.rows = []
  assert.deepEqual(view().rows, [])
  assert.equal(legacy.rows[0].values[1], 'Keep notes')
})
