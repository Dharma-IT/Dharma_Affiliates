import { useEffect, useMemo, useRef, useState } from 'react'
import { readWorkbookResponse, requireSheets } from './lib/workbook'
import type { Sheet } from './lib/workbook'
import type { Session } from '@supabase/supabase-js'
import { authenticatedFetch, supabase } from './lib/supabase'
import dropdowns from './data/dropdowns.json'
import './App.css'

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
function App({ initial, initialRevision, email, onSignOut }: { initial: Sheet[]; initialRevision: number; email: string; onSignOut: () => Promise<void> }) {
  const [sheets,setSheets] = useState<Sheet[]>(initial)
  const revision = useRef(initialRevision)
  const lastSaved = useRef(JSON.stringify(initial))
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial))
  const saving = useRef(false)
  const latest = useRef(sheets)
  const [saveTick, setSaveTick] = useState(0)
  const [saveStatus, setSaveStatus] = useState('Saved to database.')
  const [tab,setTab]=useState(0)
  const [search,setSearch]=useState('')
  const [quality,setQuality]=useState('All qualities')
  const [notice,setNotice]=useState('')
  const [saveError,setSaveError]=useState('')
  const [position,setPosition]=useState(0)
  const scroll=useRef<HTMLDivElement>(null)
  const sheet=sheets[tab]
  useEffect(() => {
    latest.current = sheets
    if (JSON.stringify(sheets) === lastSaved.current) return
    const timer = setTimeout(async () => {
      if (saving.current) return
      saving.current = true
      setSaveStatus('Saving to database...')
      setSaveError('')
      const snapshot = JSON.stringify(latest.current)
      try {
        const response = await authenticatedFetch('/api/workbook', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheets: JSON.parse(snapshot), revision: revision.current }),
        })
        const result = await readWorkbookResponse(response)
        revision.current = result.revision
        lastSaved.current = snapshot
        setSavedSnapshot(snapshot)
        setSaveStatus('Saved to database.')
        setSaveTick(t => t + 1)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Could not save changes.')
      } finally { saving.current = false }
    }, 600)
    return () => clearTimeout(timer)
  }, [sheets, saveTick])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== lastSaved.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(''),3000);return ()=>clearTimeout(timer)}},[notice])
  const qualityIndex=sheet.headers.indexOf('Quality')
  const rows=useMemo(()=>sheet.rows.filter(r=>r.values.some(v=>v.toLowerCase().includes(search.toLowerCase()))&&(quality==='All qualities'||r.values[qualityIndex]===quality)),[sheet,search,quality,qualityIndex])
  function changeTab(i:number){setTab(i);setSearch('');setQuality('All qualities');setPosition(0);if(scroll.current)scroll.current.scrollLeft=0}
  function update(id:string,col:number,value:string){setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:s.rows.map(r=>r.id!==id?r:{...r,values:r.values.map((v,j)=>j===col?value:v)})}))}
  function add(){setSearch('');setQuality('All qualities');setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:[{id:crypto.randomUUID(),values:s.headers.map(()=> '')},...s.rows]}));scroll.current?.scrollTo({top:0,left:0});setPosition(0);setNotice('New row added. Start typing to fill it in.')}
  function remove(id:string){if(!confirm('Delete this row? This cannot be undone.'))return;setSheets(prev=>prev.map((s,i)=>i!==tab?s:{...s,rows:s.rows.filter(r=>r.id!==id)}));setNotice('Row deleted')}
  function download(json=false){const data=json?JSON.stringify({sheet:sheet.name,headers:sheet.headers,rows:rows.map(r=>r.values)},null,2):'\ufeff'+[sheet.headers,...rows.map(r=>r.values)].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([data],{type:json?'application/json':'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=sheet.name+(json?'.json':'.csv');a.click();URL.revokeObjectURL(url);setNotice('Export downloaded')}
  function move(value:number){setPosition(value);if(scroll.current)scroll.current.scrollLeft=(scroll.current.scrollWidth-scroll.current.clientWidth)*value/100}
  const title=tab===0?'Affiliate Management':tab===1?'Good Affiliates':tab===2?'Review Follow-ups':sheet.name
  return <div className="workspace">
    <header className="floating-header"><a className="brand" href="/" aria-label="Dharma affiliate tool"><img src={logo} alt="Dharma logo"/><span>AFFILIATE TOOL</span></a><nav aria-label="Workbook sheets">{sheets.slice(0,3).map((s,i)=><button key={s.name} className={tab===i?'active':''} onClick={()=>changeTab(i)}>{labels[i] || s.name}<span>{s.rows.length}</span></button>)}{sheets.length > 3 && <select aria-label="More workbook sheets" value={tab > 2 ? tab : ""} onChange={e => changeTab(Number(e.target.value))}><option value="" disabled>More sheets</option>{sheets.slice(3).map((s,i) => <option key={s.name} value={i + 3}>{s.name} ({s.rows.length})</option>)}</select>}</nav><div className="header-team"><span className="status-dot"/>{email}<button onClick={async () => { if (JSON.stringify(sheets) !== lastSaved.current && !confirm("You have unsaved changes. Sign out and discard them?")) return; try { await onSignOut() } catch { setNotice("Could not sign out. Please try again.") } }}>Sign out</button></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow">DHARMA PARTNERSHIPS</div><span className="hero-symbol" aria-hidden="true">✧</span><h1>{tab===0?<>Affiliate<br/>Management</>:tab===1?<>Good<br/>Affiliates</>:tab===2?<>Review<br/>Follow-ups</>:sheet.name}</h1><p>{tab===2?'Keep every conversation, review, and follow-up in one place.':'Manage your creators, track content, and grow lasting partnerships with clear handoffs.'}</p></div><div className="hero-card"><img src={logo} alt=""/><h2>{title}</h2><p>{tab===2?'Review feedback, update outcomes, and keep your next steps clear.':'Every creator, collaboration, delivery, and update in one focused, editable workspace.'}</p><a href="#production-table">VIEW {tab===2?'REVIEWS':'AFFILIATES'} <span>↓</span></a><div className="hero-card-footer"><span>{sheet.rows.length} {tab===2?'reviews':'affiliates'}</span><span>One connected workspace</span></div></div></section>
      <section className="production-card" id="production-table"><div className="section-heading"><div><div className="eyebrow">{tab===2?'REVIEW TRACKER':'AFFILIATE DIRECTORY'}</div><h2>{tab===2?'Review Follow-up Table':tab > 2 ? sheet.name : 'Affiliate Production Table'}</h2><p>{tab===2?'Edit reviews, contact details, and follow-up outcomes directly in the table.':'Manage accounts, content, deliveries, and collaboration details in one editable table.'}</p></div><div className="actions"><button onClick={add}>Add row</button><button onClick={()=>download()}>Export CSV</button><button onClick={()=>download(true)}>Export JSON</button></div></div>
      <div className="color-legend" aria-label="Status color key"><span><i className="legend-green"/>Good / Yes / Delivered</span><span><i className="legend-amber"/>Medium / Waiting</span><span><i className="legend-orange"/>Low / In process</span><span><i className="legend-rose"/>No / Not contact</span></div><div className="table-toolbar"><span className={'save-label '+(saveError?'error':'')} role="status"><span className="status-dot"/>{saveError || (JSON.stringify(sheets) !== savedSnapshot ? 'Changes pending: ' + saveStatus.replace('Saved to database.', 'Waiting to save.') : saveStatus)}{saveError && <button onClick={() => setSaveTick(t => t + 1)}>Retry save</button>}</span><div className="filter-tools"><input aria-label="Search records" placeholder="Search this sheet…" value={search} onChange={e=>setSearch(e.target.value)}/>{qualityIndex>=0&&<select aria-label="Filter by quality" value={quality} onChange={e=>setQuality(e.target.value)}><option>All qualities</option>{[...new Set(sheet.rows.map(r=>r.values[qualityIndex]).filter(Boolean))].map(q=><option key={q}>{q}</option>)}</select>}</div></div>
      <div className="scroll-controls"><button aria-label="Scroll table left" onClick={()=>move(Math.max(0,position-20))}>←</button><input type="range" min="0" max="100" value={position} aria-label="Horizontal table position" onChange={e=>move(Number(e.target.value))}/><button aria-label="Scroll table right" onClick={()=>move(Math.min(100,position+20))}>→</button></div>
      <div className="table-scroll" ref={scroll} onScroll={e=>{const el=e.currentTarget;setPosition(el.scrollWidth>el.clientWidth?el.scrollLeft/(el.scrollWidth-el.clientWidth)*100:0)}}><table><thead><tr>{sheet.headers.map((h,i)=><th key={i}>{h}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>{sheet.headers.map((h,i)=>{const options=dropdownOptions[h] || (h==='Review'?['1 Star','2 Star','3 Star','4 Star','5 Star','Eliminada']:null);return <td key={i} className={['Status','Outcome'].includes(h)?'wide-cell':''}>{options?<select className={'status-select '+fieldColor(h,r.values[i]||'')} aria-label={h+' for '+(r.values[0]||'new record')} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}><option value="">Select…</option>{[...new Set([...options,...sheet.rows.map(row=>row.values[i]).filter(Boolean)])].map(v=><option className={fieldColor(h,v)} key={v}>{v}</option>)}</select>:['Status','Outcome','Product'].includes(h)?<textarea aria-label={h+' for '+(r.values[0]||'new record')} placeholder={h} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}/>:<input aria-label={h+' for '+(r.values[0]||'new record')} placeholder={h} value={r.values[i]||''} onChange={e=>update(r.id,i,e.target.value)}/>}{h==='TikTok Acct'&&r.values[i]&&<a className="account-link" href={'https://www.tiktok.com/@'+encodeURIComponent(r.values[i].replace(/^@/,''))} target="_blank" rel="noreferrer">Open account ↗</a>}</td>})}<td><button className="delete-row" onClick={()=>remove(r.id)} aria-label={'Delete '+(r.values[0]||'new row')}>Delete</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty"><span>✧</span><h3>{sheet.rows.length?'No matching records':'Start with a new connection'}</h3><p>{sheet.rows.length?'Try another search or clear the filters.':'This sheet is ready for your first affiliate.'}</p><button onClick={()=>sheet.rows.length?(setSearch(''),setQuality('All qualities')):add()}>{sheet.rows.length?'Clear filters':'Add row'}</button></div>}</div><footer className="table-footer"><span>{rows.length} of {sheet.rows.length} records</span><span>Edit any field · Changes save automatically</span></footer>
      </section><footer className="page-footer"><span>DHARMA</span><p>Affiliate workspace</p><span>Made for meaningful partnerships.</span></footer>
    </main>{notice&&<div className="toast" role="status">{notice}</div>}
  </div>
}
function Workspace() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [workbook, setWorkbook] = useState<{ sheets: Sheet[]; revision: number; userId: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const userId = authSession?.user.id
  useEffect(() => {
    // Remove the legacy unprotected workbook cache from earlier app versions.
    try { localStorage.removeItem('dharma-affiliates-v1') } catch { /* Storage may be disabled. */ }
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session)
      setInitializing(false)
      if (!session) setWorkbook(null)
    })
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      setError('')
      try {
        const result = await readWorkbookResponse(await authenticatedFetch('/api/workbook', { cache: 'no-store' }))
        requireSheets(result.sheets)
        const priority = ['Current Affiliates', 'GOOD', 'BAD REVIEW']
        const sheets = [...result.sheets].sort((a,b) => (priority.includes(a.name) ? priority.indexOf(a.name) : 3) - (priority.includes(b.name) ? priority.indexOf(b.name) : 3))
        if (!cancelled) setWorkbook({ sheets, revision: result.revision, userId: userId! })
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : 'Could not load the workspace.') }
    }
    void load()
    return () => { cancelled = true }
  }, [userId, retry])
  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      setPassword('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not sign in.') }
    finally { setLoading(false) }
  }
  async function signOut() {
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) throw error
    setWorkbook(null)
    setAuthSession(null)
    setError('')
    setPassword('')
  }
  if (!supabase) return <main className="workspace-login"><div role="alert">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy to enable sign-in.</div></main>
  if (initializing) return <main className="workspace-login"><p role="status">Checking your session...</p></main>
  if (authSession && workbook && workbook.userId === userId) return <App key={userId} initial={workbook.sheets} initialRevision={workbook.revision} email={authSession.user.email || 'Signed in'} onSignOut={signOut} />
  if (authSession) return <main className="workspace-login"><div><p role="status">{error || 'Loading your workspace...'}</p>{error && <button onClick={() => setRetry(t => t + 1)}>Retry</button>}<button onClick={() => { void signOut().catch(() => setError('Could not sign out. Please try again.')) }}>Sign out</button></div></main>
  return <main className="workspace-login"><form onSubmit={signIn}><img src={logo} alt="Dharma" width="100" /><div><div className="eyebrow">DHARMA PARTNERSHIPS</div><h1>Sign in</h1><p>Use your Dharma account to access the affiliate workspace.</p></div><label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@dharma.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="sign-in-button" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>{error && <p role="alert">{error}</p>}<p className="sign-in-help">Need access? Contact your workspace administrator.</p></form></main>
}
export default Workspace
