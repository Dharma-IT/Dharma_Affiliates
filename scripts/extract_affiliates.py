"""Read the original workbook without modifying it; generate lossless import data and SQL."""
import datetime
import hashlib
import json
import sys
import uuid
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
book = openpyxl.load_workbook(source, data_only=False)
cached = openpyxl.load_workbook(source, data_only=True)


def raw(value):
    return value.isoformat() if isinstance(value, (datetime.datetime, datetime.date, datetime.time)) else value


def display(cell, value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat(sep=' ') if isinstance(value, datetime.datetime) else value.isoformat()
    if isinstance(value, (int, float)):
        if cell.number_format == '0%':
            return f'{value * 100:.0f}%'
        return str(int(value)) if float(value).is_integer() else str(value)
    return str(value)


sheets = []
for sheet in book:
    populated = [row for row in sheet if any(c.value is not None and str(c.value).strip() for c in row)]
    if not populated:
        sheets.append({'name': sheet.title, 'headers': ['Name', 'Phone', 'GMV $ - Last 30 days', 'Status'] if sheet.title == 'GOOD' else ['Column A'], 'rows': [], 'source': {'headerRow': None, 'columns': []}})
        continue
    has_header = sheet.title != 'Samples'  # Samples starts immediately with a creator record.
    columns = sorted({c.column for row in populated for c in row if c.value is not None and str(c.value).strip()})
    headers = [(str(sheet.cell(1, col).value).strip() if has_header and sheet.cell(1, col).value is not None else '') or 'Column ' + get_column_letter(col) for col in columns]
    rows = []
    for cells in populated:
        row_number = cells[0].row
        if has_header and row_number == 1:
            continue
        row_cells = [sheet.cell(row_number, col) for col in columns]
        rows.append({
            'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'dharma-affiliates/{sheet.title}/{row_number}')),
            'values': [display(c, cached[sheet.title][c.coordinate].value if c.data_type == 'f' else c.value) for c in row_cells],
            'sourceRow': row_number,
            'sourceCells': {c.coordinate: {'value': raw(c.value), 'type': c.data_type, 'format': c.number_format, **({'cachedValue': raw(cached[sheet.title][c.coordinate].value)} if c.data_type == 'f' else {})} for c in row_cells if c.value is not None},
        })
    sheets.append({'name': sheet.title, 'headers': headers, 'rows': rows, 'source': {'headerRow': 1 if has_header else None, 'columns': columns}})

order = ['Current Affiliates', 'GOOD', 'BAD REVIEW']
sheets.sort(key=lambda s: order.index(s['name']) if s['name'] in order else 3)
payload = json.dumps(sheets, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
(root / 'supabase' / 'workbook-import.json').write_text(payload + '\n', encoding='utf-8')
schema = (root / 'supabase' / 'schema.sql').read_text(encoding='utf-8')
assert '$affiliate_import$' not in payload
sql = '-- Schema and complete Excel import. Safe to rerun: existing workbook is never replaced.\nbegin;\n' + schema + '\ninsert into public.affiliate_workbooks (id, sheets, revision)\nvalues (\'main\', $affiliate_import$' + payload + '$affiliate_import$::jsonb, 1)\non conflict (id) do nothing;\ncommit;\n\nselect sheet->>\'name\' as sheet, jsonb_array_length(sheet->\'rows\') as records\nfrom public.affiliate_workbooks, jsonb_array_elements(sheets) as sheet\nwhere id = \'main\';\n'
(root / 'supabase' / 'setup-and-import.sql').write_text(sql, encoding='utf-8')
report = {'source': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sheets': [{'name': s['name'], 'rows': len(s['rows']), 'columns': len(s['headers'])} for s in sheets], 'totalRows': sum(len(s['rows']) for s in sheets), 'notes': ['Blank formatting-only rows excluded.', 'Samples has no header: first row retained; columns labeled by Excel letter.', 'Original typed values, formulas and cached results retained in sourceCells.', 'GOOD is empty in the source workbook.']}
(root / 'supabase' / 'import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
