import { useEffect, useMemo, useRef, useState } from 'react'
import original from './data/workbook.json'
import dropdowns from './data/dropdowns.json'
import './App.css'

type Row = { id: string; values: string[] }
type Sheet = { name: string; headers: string[]; rows: Row[] }
const KEY = 'dharma-affiliates-v1'
const seed: Sheet[] = original.map(s => { const cols = s.headers.map((h,i)=>h.trim()?i:-1).filter(i=>i>=0); return {...s, headers:cols.map(i=>s.headers[i]),rows:s.rows.map(r=>({...r,values:cols.map(i=>r.values[i] || '')}))} })
const goodHeaders = ['Name', 'Phone', 'GMV $ - Last 30 days', 'Status']
function normalizeSheets(sheets: Sheet[]): Sheet[] {
  return sheets.map(sheet => sheet.name !== 'GOOD' ? sheet : {
    ...sheet, headers: goodHeaders,
    rows: sheet.rows.map(row => ({...row, values: goodHeaders.map(header => row.values[sheet.headers.indexOf(header)] || '')})),
  })
}
const logo = '/DHARMA%20-%20LOGO%20(9).png'
const labels=['Current Affiliates','GOOD','BAD REVIEW']
const dropdownOptions: Record<string, string[]> = dropdowns
function fieldColor(header: string, value: string) {
  const v = value.trim().toLowerCase()
  if (!v) return 'color-empty'
  if (header === 'Quality') return ({good:'color-green',medium:'color-amber',low:'color-orange','not contact':'color-rose'} as Record<string,string>)[v] || 'color-neutral'
  if (['Any Content?', 'LeadDyno'].includes(header)) return v === 'yes' ? 'color-green' : v === 'no' ? 'color-rose' : 'color-neutral'
  if (header === 'Delivery') return v.includes('delivered') ? 'color-green' : 'color-orange'
  if (header === 'Live/videos') return v === 'live' ? 'color-purple' : v === 'videos' ? 'color-blue' : 'color-teal'
  if (header === 'Collab') return v.includes('waiting') ? 'color-amber' : v.includes('adri') ? 'color-purple' : v.includes('target') ? 'color-blue' : 'color-teal'
  if (header === 'Review') return v === '5 star' ? 'color-green' : v === '4 star' ? 'color-teal' : v === '3 star' ? 'color-amber' : v === 'eliminada' ? 'color-neutral' : 'color-rose'
  return 'color-neutral'
}
function App() {
  const [sheets,setSheets] = useState<Sheet[]>(()=>{try {const saved=localStorage.getItem(KEY);return normalizeSheets(saved?JSON.parse(saved):seed)}catch{return normalizeSheets(seed)}})
  const [tab,setTab]=useState(0)
  const [search,setSearch]=useState('')
  const [quality,setQuality]=useState('All qualities')
  const [notice,setNotice]=useState('')
  const [saveError,setSaveError]=useState(false)
  const [position,setPosition]=useState(0)
  const scroll=useRef<HTMLDivElement>(null)
  const sheet=sheets[tab]
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(sheets));setSaveError(false)}catch{setSaveError(true)}},[sheets])
  useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),3000);return ()=>clearTimeout(timer)}},[notice])
  const qualityIndex=sheet.headers.indexOf('Quality')
  const rows=useMemo(()=>sheet.rows.filter(r=>r.values.some(v=>v.toLowerCase().includes(search.toLowerCase()))&&(quality==='All qualities'||r.values[qualityIndex]===quality)),[sheet,search,quality,qualityIndex])
  function changeTab(i:number){setTab(i);setSearch('');setQuality('All qualities');setPosition(0);if(scroll.current)scroll.current.scrollLeft=0}
  function update(id:string,col:number,value:string){setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:s.rows.map(r=>r.id!==id?r:{...r,values:r.values.map((v,j)=>j===col?value:v)})}))}
  function add(){setSearch('');setQuality('All qualities');setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:[{id:crypto.randomUUID(),values:s.headers.map(()=> '')},...s.rows]}));scroll.current?.scrollTo({top:0,left:0});setPosition(0);setNotice('New row added. Start typing to fill it in.')}
  function remove(id:string){if(!confirm('Delete this row? This cannot be undone.'))return;setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:s.rows.filter(r=>r.id!==id)}));setNotice('Row deleted')}
  function download(json=false){const data=json?JSON.stringify({sheet:sheet.name,headers:sheet.headers,rows:rows.map(r=>r.values)},null,2):'\ufeff'+[sheet.headers,...rows.map(r=>r.values)].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([data],{type:json?'application/json':'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=sheet.name+(json?'.json':'.csv');a.click();URL.revokeObjectURL(url);setNotice('Export downloaded')}
  function move(value:number){setPosition(value);if(scroll.current)scroll.current.scrollLeft=(scroll.current.scrollWidth-scroll.current.clientWidth)*value/100}
  const title=tab===0?'Affiliate Management':tab===1?'Good Affiliates':'Review Follow-ups'
  return <div className="workspace">
    <header className="floating-header"><a className="brand" href="/" aria-label="Dharma affiliate tool"><img src={logo} alt="Dharma logo"/><span>AFFILIATE TOOL</span></a><nav aria-label="Workbook sheets">{sheets.map((s,i)=><button key={s.name} className={tab===i?'active':''} onClick={()=>changeTab(i)}>{labels[i]}<span>{s.rows.length}</span></button>)}</nav><div className="header-team"><span className="status-dot"/>Dharma workspace</div></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow">DHARMA PARTNERSHIPS</div><span className="hero-symbol" aria-hidden="true">✧</span><h1>{tab===0?<>Affiliate<br/>Management</>:tab===1?<>Good<br/>Affiliates</>:<>Review<br/>Follow-ups</>}</h1><p>{tab===2?'Keep every conversation, review, and follow-up in one place.':'Manage your creators, track content, and grow lasting partnerships with clear handoffs.'}</p></div><div className="hero-card"><img src={logo} alt=""/><h2>{title}</h2><p>{tab===2?'Review feedback, update outcomes, and keep your next steps clear.':'Every creator, collaboration, delivery, and update in one focused, editable workspace.'}</p><a href="#production-table">VIEW {tab===2?'REVIEWS':'AFFILIATES'} <span>↓</span></a><div className="hero-card-footer"><span>{sheet.rows.length} {tab===2?'reviews':'affiliates'}</span><span>One connected workspace</span></div></div></section>
      <section className="production-card" id="production-table"><div className="section-heading"><div><div className="eyebrow">{tab===2?'REVIEW TRACKER':'AFFILIATE DIRECTORY'}</div><h2>{tab===2?'Review Follow-up Table':'Affiliate Production Table'}</h2><p>{tab===2?'Edit reviews, contact details, and follow-up outcomes directly in the table.':'Manage accounts, content, deliveries, and collaboration details in one editable table.'}</p></div><div className="actions"><button onClick={add}>Add row</button><button onClick={()=>download()}>Export CSV</button><button onClick={()=>download(true)}>Export JSON</button></div></div>
      <div className="color-legend" aria-label="Status color key"><span><i className="legend-green"/>Good / Yes / Delivered</span><span><i className="legend-amber"/>Medium / Waiting</span><span><i className="legend-orange"/>Low / In process</span><span><i className="legend-rose"/>No / Not contact</span></div><div className="table-toolbar"><span className={'save-label '+(saveError?'error':'')} role="status"><span className="status-dot"/>{saveError?'Storage full. Export to keep changes.':'Saved in this browser.'}</span><div className="filter-tools"><input aria-label="Search records" placeholder="Search this sheet…" value={search} onChange={e=>setSearch(e.target.value)}/>{qualityIndex>=0&&<select aria-label="Filter by quality" value={quality} onChange={e=>setQuality(e.target.value)}><option>All qualities</option>{[...new Set(sheet.rows.map(r=>r.values[qualityIndex]).filter(Boolean))].map(q=><option key={q}>{q}</option>)}</select>}</div></div>
      <div className="scroll-controls"><button aria-label="Scroll table left" onClick={()=>move(Math.max(0,position-20))}>←</button><input type="range" min="0" max="100" value={position} aria-label="Horizontal table position" onChange={e=>move(Number(e.target.value))}/><button aria-label="Scroll table right" onClick={()=>move(Math.min(100,position+20))}>→</button></div>
      <div className="table-scroll" ref={scroll} onScroll={e=>{const el=e.currentTarget;setPosition(el.scrollWidth>el.clientWidth?el.scrollLeft/(el.scrollWidth-el.clientWidth)*100:0)}}><table><thead><tr>{sheet.headers.map((h,i)=><th key={i}>{h}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>{sheet.headers.map((h,i)=>{const options=dropdownOptions[h] || (h==='Review'?['1 Star','2 Star','3 Star','4 Star','5 Star','Eliminada']:null);return <td key={i} className={['Status','Outcome'].includes(h)?'wide-cell':''}>{options?<select className={'status-select '+fieldColor(h,r.values[i]||'')} aria-label={h+' for '+(r.values[0]||'new record')} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}><option value="">Select…</option>{[...new Set([...options,...sheet.rows.map(row=>row.values[i]).filter(Boolean)])].map(v=><option className={fieldColor(h,v)} key={v}>{v}</option>)}</select>:['Status','Outcome','Product'].includes(h)?<textarea aria-label={h+' for '+(r.values[0]||'new record')} placeholder={h} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}/>:<input aria-label={h+' for '+(r.values[0]||'new record')} placeholder={h} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}/>}{h==='TikTok Acct'&&r.values[i]&&<a className="account-link" href={'https://www.tiktok.com/@'+encodeURIComponent(r.values[i].replace(/^@/,''))} target="_blank" rel="noreferrer">Open account ↗</a>}</td>})}<td><button className="delete-row" onClick={()=>remove(r.id)} aria-label={'Delete '+(r.values[0]||'new row')}>Delete</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty"><span>✧</span><h3>{sheet.rows.length?'No matching records':'Start with a new connection'}</h3><p>{sheet.rows.length?'Try another search or clear the filters.':'This sheet is ready for your first affiliate.'}</p><button onClick={()=>sheet.rows.length?(setSearch(''),setQuality('All qualities')):add()}>{sheet.rows.length?'Clear filters':'Add row'}</button></div>}</div><footer className="table-footer"><span>{rows.length} of {sheet.rows.length} records</span><span>Edit any field · Changes save automatically</span></footer>
      </section><footer className="page-footer"><span>DHARMA</span><p>Affiliate workspace</p><span>Made for meaningful partnerships.</span></footer>
    </main>{notice&&<div className="toast" role="status">{notice}</div>}
  </div>
}
export default App
