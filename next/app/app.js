/* ══════════════════════════════════════════════════════════════════════════
   JB Finance v3 — application shell
   Buildless React (JSX via Babel-standalone) on top of the tested engine in
   window.JBF. Redesigned UI, currency-safe maths, memoized derivations,
   session-aware data loading, and a real Tally "Books Health" report.
   ════════════════════════════════════════════════════════════════════════════ */
const { useState, useEffect, useMemo, useCallback, useRef } = React;

/* Engine (verified in next/tests/engine.test.js) */
const E = window.JBF;
const {
  SEED_BANKS, SEED_CC, CATEGORIES, INCOME_CATEGORIES,
  tallyMiddleware, fmt, fmtAmt, fmtCompact, fmtDate, round2,
  computeBalances, computeProvisions, computeLiquid, computeTotalCC,
  computeUdhariOut, computeBooksHealth, computeLedgerGroups,
  computeSiteLedger, listSites,
} = E;

/* Same backend as the production app (Supabase anon key — public by design, RLS-guarded) */
const SUPA_URL = 'https://ayzlaumbrntpqfemnxao.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5emxhdW1icm50cHFmZW1ueGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNjQwNTAsImV4cCI6MjA4OTc0MDA1MH0.VEYId6dpxCvmTArXq-FVZqy5WTgl0QTcLamYMovaqgE';
const db = supabase.createClient(SUPA_URL, SUPA_KEY);
const CLASSIC_URL = '../index.html';

/* ── helpers ── */
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const uid4 = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random());

/* ════════════════════════ Error boundary ════════════════════════ */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div className="section" style={{ paddingTop: 48 }}>
          <div className="card pad">
            <div className="eyebrow neg">Something broke</div>
            <p className="mono" style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-2)' }}>{String(this.state.err)}</p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ════════════════════════ PIN gate ════════════════════════ */
function PinGate({ onUnlock }) {
  const [digits, setDigits] = useState([]);
  const [setup, setSetup] = useState(!localStorage.getItem('jbf_pin_hash'));
  const [step, setStep] = useState(1);
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(false);
  const MAX = 4;

  const fail = (m) => { setMsg(m); setShake(true); setTimeout(() => setShake(false), 450); setDigits([]); };

  const press = async (d) => {
    if (digits.length >= MAX) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length < MAX) return;
    const pin = next.join('');
    if (setup) {
      if (step === 1) { setFirst(pin); setDigits([]); setStep(2); setMsg('Confirm your PIN'); }
      else if (pin === first) { localStorage.setItem('jbf_pin_hash', await hashPin(pin)); onUnlock(); }
      else { setStep(1); setFirst(''); fail('PINs did not match'); }
    } else {
      if ((await hashPin(pin)) === localStorage.getItem('jbf_pin_hash')) onUnlock();
      else fail('Wrong PIN');
    }
  };

  const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
  const title = setup ? (step === 1 ? 'Set a 4-digit PIN' : 'Confirm PIN') : 'Enter PIN';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: 24, userSelect: 'none' }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)', letterSpacing: '-.01em' }}>JB Finance</div>
      <div className="eyebrow" style={{ marginTop: 6 }}>{title}</div>
      <div style={{ display: 'flex', gap: 16, margin: '26px 0', animation: shake ? 'shake .4s' : 'none' }}>
        {Array.from({ length: MAX }).map((_, i) => (
          <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < digits.length ? 'var(--green)' : 'transparent', border: '2px solid', borderColor: i < digits.length ? 'var(--green)' : 'var(--line-2)' }} />
        ))}
      </div>
      {msg && <div className="mono warn" style={{ fontSize: 11, marginBottom: 14 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 70px)', gap: 12 }}>
        {KEYS.map((k, i) => k === null ? <div key={i} /> : (
          <button key={i} onClick={() => k === 'del' ? setDigits((p) => p.slice(0, -1)) : press(k)}
            style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--bg-3)', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: k === 'del' ? 16 : 24, fontWeight: 600, cursor: 'pointer' }}>
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

/* ════════════════════════ Login ════════════════════════ */
function Login() {
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    if (!email.trim() || !pass) return;
    setBusy(true); setErr('');
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password: pass });
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
    setBusy(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>JB Finance</div>
        <div className="eyebrow" style={{ marginTop: 6 }}>Personal CFO OS · v3</div>
      </div>
      <div className="card pad stack">
        <div className="eyebrow">Secure login</div>
        <input className="input" type="email" placeholder="Email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <input className="input" type="password" placeholder="Password" value={pass} autoComplete="current-password"
          onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {err && <div className="badge bad" style={{ padding: '8px 12px' }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !email.trim() || !pass} onClick={go}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
      <p className="mono muted" style={{ textAlign: 'center', fontSize: 10, marginTop: 18, lineHeight: 1.8 }}>
        Umiya Associates · Mumbai<br />Data secured via Supabase RLS
      </p>
    </div>
  );
}

/* ════════════════════════ Data layer ════════════════════════ */
function useData(session) {
  const [state, setState] = useState({ txns: [], opening: {}, customAccounts: [], recurring: [], udhari: [], siteOpenings: {}, loading: true });

  const load = useCallback(async () => {
    if (!session) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const COLS = 'id,created_at,type,amount,category,from_account,to_account,particulars,tower,status,source,domain,site_name,party_name,user_id,it_section,dr_ledger,cr_ledger,direction';
      let txns = [], from = 0; const PAGE = 500;
      for (;;) {
        const { data, error } = await db.from('transactions').select(COLS).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
        if (error) throw error;
        txns = txns.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      const out = { txns, opening: {}, customAccounts: [], recurring: [], udhari: [], siteOpenings: {}, loading: false };
      try { const { data } = await db.from('recurring').select('*'); out.recurring = data || []; } catch (e) {}
      try { const { data } = await db.from('udhari').select('*'); out.udhari = data || []; } catch (e) {}
      try {
        const { data } = await db.from('settings').select('*');
        const g = (k) => (data || []).find((r) => r.key === k);
        if (g('opening_balances')) try { out.opening = JSON.parse(g('opening_balances').value); } catch (e) {}
        if (g('custom_accounts')) try { out.customAccounts = JSON.parse(g('custom_accounts').value); } catch (e) {}
        if (g('site_openings')) try { out.siteOpenings = JSON.parse(g('site_openings').value); } catch (e) {}
      } catch (e) {}
      setState(out);
    } catch (e) {
      console.error('load error', e);
      setState((s) => ({ ...s, loading: false }));
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);
  return [state, load];
}

/* ════════════════════════ Reusable bits ════════════════════════ */
const ICONS = {
  dash: '◈', add: '＋', log: '≡', more: '⋯',
};
function TabBar({ tab, setTab }) {
  const tabs = [['dash', 'Dash'], ['log', 'Log'], ['add', 'Add'], ['more', 'More']];
  return (
    <nav className="tabbar">
      {tabs.map(([id, label]) => (
        <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-label={label}>
          <span className="ico">{ICONS[id]}</span>{label}
        </button>
      ))}
    </nav>
  );
}

/* ════════════════════════ Dashboard ════════════════════════ */
function Dashboard({ d, derived, setTab }) {
  const { liquid, totalCC, netBlocked, spendable, udhariOut, groups, health } = derived;
  const recent = d.txns.slice(0, 8);
  return (
    <div className="fade-in">
      <div className="section">
        <div className="hero">
          <div className="eyebrow">True spendable</div>
          <div className="h-amount" style={{ fontSize: 38, color: 'var(--green)', margin: '8px 0' }}>{fmtAmt(spendable)}</div>
          <div className="mono muted" style={{ fontSize: 11 }}>
            Liquid <span className="pos">{fmtCompact(liquid)}</span> · CC due <span className="neg">{fmtCompact(totalCC)}</span> · Blocked <span className="info">{fmtCompact(netBlocked)}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="tiles three">
          <div className="tile"><div className="label">Net Worth</div><div className="value">{fmtCompact(groups.netWorth)}</div></div>
          <div className="tile"><div className="label">Assets</div><div className="value pos">{fmtCompact(groups.assetTotal)}</div></div>
          <div className="tile"><div className="label">Liabilities</div><div className="value neg">{fmtCompact(groups.liabilityTotal)}</div></div>
        </div>
      </div>

      {/* Tally Books Health — the enhanced double-entry report */}
      <div className="section">
        <div className="section-title">Books Health · Tally</div>
        <div className="card pad">
          <div className="spread">
            <span className="mono" style={{ fontSize: 13 }}>Double-entry integrity</span>
            <span className={'badge ' + (health.balanced && health.fullyPosted ? 'ok' : health.balanced ? 'warn' : 'bad')}>
              {health.balanced && health.fullyPosted ? 'Balanced' : health.balanced ? 'Balanced · legacy rows' : 'Unbalanced'}
            </span>
          </div>
          <div className="tiles" style={{ marginTop: 12 }}>
            <div className="tile"><div className="label">Dr total</div><div className="value">{fmtCompact(health.totalDr)}</div></div>
            <div className="tile"><div className="label">Cr total</div><div className="value">{fmtCompact(health.totalCr)}</div></div>
          </div>
          <div className="mono muted" style={{ fontSize: 10, marginTop: 10 }}>
            {health.deRows} posted · {health.legacyRows} legacy (heuristic) rows
          </div>
        </div>
      </div>

      {/* Position by Tally group */}
      <div className="section">
        <div className="section-title">Position by Group</div>
        <div className="card">
          {groups.groups.length === 0 && <div className="empty">No balances yet</div>}
          {groups.groups.map((g) => (
            <div className="row" key={g.group}>
              <div className="left">
                <div className="title">{g.group}</div>
                <div className="sub">{g.nature} · {g.accounts.length} ledger(s)</div>
              </div>
              <div className={'amt ' + (g.total < 0 ? 'neg' : 'pos')}>{fmtAmt(g.total)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title"><span>Recent</span><span className="pill" onClick={() => setTab('log')}>View all</span></div>
        <div className="card">
          {recent.length === 0 && <div className="empty">No transactions yet</div>}
          {recent.map((t) => <TxnRow key={t.id} t={t} />)}
        </div>
      </div>

      {udhariOut !== 0 && (
        <div className="section">
          <div className="card pad spread">
            <span className="mono" style={{ fontSize: 13 }}>Udhari outstanding</span>
            <span className={'mono ' + (udhariOut > 0 ? 'warn' : 'pos')} style={{ fontWeight: 700 }}>{fmtAmt(udhariOut)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TxnRow({ t, onVoid }) {
  const isIn = ['Income', 'UA Received', 'CC→Bank'].includes(t.type);
  const isTransfer = ['Bank→Bank', 'Bank→CC', 'Bank→Cash', 'Cash→Bank', 'CC→Bank'].includes(t.type);
  const cls = isTransfer ? 'info' : isIn ? 'pos' : 'neg';
  const sign = isTransfer ? '' : isIn ? '+' : '−';
  return (
    <div className="row">
      <div className="left">
        <div className="title">{t.particulars || t.category || t.type}</div>
        <div className="sub">{(t.category || t.type)} · {t.from_account || t.to_account || '—'} · {fmtDate(t.created_at)}{t.status === 'voided' ? ' · VOID' : ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={'amt ' + cls} style={{ textDecoration: t.status === 'voided' ? 'line-through' : 'none' }}>{sign}{fmtAmt(t.amount)}</div>
        {onVoid && t.status !== 'voided' && <button className="pill" style={{ padding: '2px 8px', marginTop: 4, fontSize: 9 }} onClick={() => onVoid(t)}>void</button>}
      </div>
    </div>
  );
}

/* ════════════════════════ Transaction log ════════════════════════ */
function Log({ d, onVoid }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return d.txns;
    return d.txns.filter((t) => ((t.particulars || '') + ' ' + (t.category || '') + ' ' + (t.type || '') + ' ' + (t.from_account || '') + ' ' + (t.to_account || '')).toLowerCase().includes(s));
  }, [q, d.txns]);
  return (
    <div className="fade-in">
      <div className="section">
        <input className="input" placeholder="Search transactions…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="section">
        <div className="section-title">{list.length} entries</div>
        <div className="card">
          {list.length === 0 && <div className="empty">Nothing found</div>}
          {list.slice(0, 300).map((t) => <TxnRow key={t.id} t={t} onVoid={onVoid} />)}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ Add (personal core) ════════════════════════ */
const TYPES = [
  { k: 'Expense', label: 'Expense' }, { k: 'Income', label: 'Income' },
  { k: 'Bank→Bank', label: 'Bank→Bank' }, { k: 'Bank→CC', label: 'Bank→CC' },
  { k: 'Cash→Bank', label: 'Cash→Bank' }, { k: 'Bank→Cash', label: 'Bank→Cash' }, { k: 'CC→Bank', label: 'CC→Bank' },
];
function AddSheet({ onSave, onClose, allBanks, allCC, allAccounts }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState('Expense');
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('');
  const [from, setFrom] = useState('Cash');
  const [to, setTo] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const needCat = type === 'Expense' || type === 'Income';
  const needFrom = ['Expense', 'Bank→Bank', 'Bank→CC', 'Bank→Cash', 'CC→Bank'].includes(type);
  const needTo = ['Income', 'Bank→Bank', 'Bank→CC', 'Cash→Bank', 'Bank→Cash', 'CC→Bank'].includes(type);
  const cats = type === 'Income' ? INCOME_CATEGORIES : CATEGORIES;

  const fromList = type === 'CC→Bank' ? allCC : type === 'Cash→Bank' ? ['Cash'] : type.startsWith('Bank') ? allBanks.filter((b) => b !== 'Cash') : allAccounts;
  const toList = type === 'Bank→CC' ? allCC : type === 'Bank→Cash' ? ['Cash'] : ['Income', 'Bank→Bank', 'Cash→Bank', 'CC→Bank'].includes(type) ? allBanks.filter((b) => b !== 'Cash') : allBanks;

  const canSave = parseFloat(amt) > 0 && (!needCat || cat) && (!needFrom || from) && (!needTo || to);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const created_at = date === today ? new Date().toISOString() : date + 'T06:30:00.000Z';
    const txn = {
      domain: 'Personal', type, amount: round2(parseFloat(amt)),
      category: needCat ? cat : type,
      from_account: needFrom ? from : null,
      to_account: needTo ? to : null,
      particulars: desc || null, status: 'complete', source: 'app-v3', created_at,
    };
    await onSave(txn);
    setSaving(false); onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="spread" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <span className="eyebrow">Add entry</span>
          <button className="pill" onClick={onClose}>✕ Close</button>
        </div>
        <div className="stack" style={{ padding: 16 }}>
          <input className="input input-amount" type="number" inputMode="decimal" placeholder="0" value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus />
          <div className="cluster">
            {TYPES.map((t) => (
              <span key={t.k} className={'pill' + (type === t.k ? ' sel' : '')} onClick={() => { setType(t.k); setCat(''); }}>{t.label}</span>
            ))}
          </div>
          {needCat && (
            <div className="field">
              <label>Category</label>
              <div className="cluster" style={{ maxHeight: 132, overflowY: 'auto' }}>
                {cats.map((c) => <span key={c.id} className={'pill' + (cat === c.id ? ' sel amber' : '')} onClick={() => setCat(c.id)}>{c.emoji} {c.id}</span>)}
              </div>
            </div>
          )}
          {needFrom && (
            <div className="field"><label>From</label>
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">—</option>{fromList.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          {needTo && (
            <div className="field"><label>To</label>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">—</option>{toList.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label>Note</label><input className="input" value={desc} placeholder="Optional" onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="field"><label>Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <button className="btn btn-primary btn-block" disabled={!canSave || saving} onClick={save}>
            {saving ? 'Saving…' : canSave ? 'Save ' + fmtAmt(parseFloat(amt) || 0) : 'Fill required fields'}
          </button>
          <p className="mono muted" style={{ fontSize: 10, textAlign: 'center' }}>
            Site, Provision, Udhari, CC-bill & Investments — <a href={CLASSIC_URL} style={{ color: 'var(--blue)' }}>open classic app</a>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ More menu ════════════════════════ */
function More({ session, theme, setTheme, setTab }) {
  const v3 = [['Udhari Ledger', 'udhari'], ['Provision Envelopes', 'provision'], ['Site Ledger (Tally)', 'site_ledger']];
  const classic = [
    ['Income & Cashflow', 'cashflow'], ['Investments', 'investments'], ['Ledger Statement', 'ledger_statement'],
    ['CC Bill Reconcile', 'cc_bill'], ['Site entry (Add)', 'site'], ['Settings & Setup', 'settings'],
  ];
  return (
    <div className="fade-in section">
      <div className="card pad">
        <div className="eyebrow">Appearance</div>
        <div className="cluster" style={{ marginTop: 10 }}>
          {['terminal', 'carbon'].map((t) => (
            <span key={t} className={'pill' + (theme === t ? ' sel' : '')} onClick={() => setTheme(t)}>{t}</span>
          ))}
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 20 }}>Ledgers</div>
      <div className="card">
        {v3.map(([label, id]) => (
          <div className="row" key={id} style={{ cursor: 'pointer' }} onClick={() => setTab(id)}>
            <span className="title">{label}</span><span className="pill sel" style={{ fontSize: 9, padding: '2px 8px' }}>v3</span>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 20 }}>Not yet redesigned — classic app</div>
      <div className="card">
        {classic.map(([label, id]) => (
          <a className="row" key={id} href={CLASSIC_URL} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="title">{label}</span><span className="muted mono" style={{ fontSize: 11 }}>open ↗</span>
          </a>
        ))}
      </div>

      <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn btn-danger btn-block" onClick={() => db.auth.signOut()}>Sign out ({session?.user?.email})</button>
      </div>
    </div>
  );
}

/* ════════════════════════ Udhari ════════════════════════ */
function UdhariScreen({ udhari, allBanks, onAdd, onDelete }) {
  const [view, setView] = useState('list');
  const [sel, setSel] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ person_name: '', amount: '', direction: 'given', mode: 'Cash', txn_date: today });
  const [saving, setSaving] = useState(false);

  const persons = {};
  udhari.forEach((u) => {
    if (!persons[u.person_name]) persons[u.person_name] = { given: 0, received: 0, entries: [] };
    if (u.direction === 'given') persons[u.person_name].given += Number(u.amount) || 0;
    if (u.direction === 'received') persons[u.person_name].received += Number(u.amount) || 0;
    persons[u.person_name].entries.push(u);
  });
  const people = Object.entries(persons).map(([name, p]) => ({ name, out: round2(p.given - p.received), ...p }))
    .sort((a, b) => b.out - a.out);
  const totalOut = round2(people.reduce((s, p) => s + Math.max(0, p.out), 0));

  const save = async () => {
    if (!form.person_name.trim() || !(parseFloat(form.amount) > 0) || saving) return;
    setSaving(true);
    await onAdd(form);
    setForm({ person_name: '', amount: '', direction: 'given', mode: 'Cash', txn_date: today });
    setSaving(false); setView('list');
  };

  if (view === 'add') {
    return (
      <div className="fade-in section stack">
        <div className="spread"><span className="pill" onClick={() => setView('list')}>← Back</span><span className="eyebrow">New udhari</span></div>
        <div className="cluster">
          <span className={'pill' + (form.direction === 'given' ? ' sel amber' : '')} onClick={() => setForm((f) => ({ ...f, direction: 'given' }))}>▲ I gave</span>
          <span className={'pill' + (form.direction === 'received' ? ' sel' : '')} onClick={() => setForm((f) => ({ ...f, direction: 'received' }))}>▼ Got back</span>
        </div>
        <div className="field"><label>Person</label><input className="input" placeholder="Name" value={form.person_name} onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))} /></div>
        <div className="field"><label>Amount</label><input className="input" type="number" inputMode="decimal" placeholder="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
        <div className="field"><label>Account</label>
          <div className="cluster">{allBanks.map((a) => <span key={a} className={'pill' + (form.mode === a ? ' sel' : '')} onClick={() => setForm((f) => ({ ...f, mode: a }))}>{a}</span>)}</div>
        </div>
        <div className="field"><label>Date</label><input className="input" type="date" max={today} value={form.txn_date} onChange={(e) => setForm((f) => ({ ...f, txn_date: e.target.value }))} /></div>
        <button className="btn btn-primary btn-block" disabled={saving || !form.person_name.trim() || !(parseFloat(form.amount) > 0)} onClick={save}>
          {saving ? 'Saving…' : 'Save ' + (form.direction === 'given' ? 'given' : 'received')}
        </button>
      </div>
    );
  }

  if (view === 'person' && sel && persons[sel]) {
    const p = persons[sel]; const out = round2(p.given - p.received);
    const entries = [...p.entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return (
      <div className="fade-in">
        <div className="section spread">
          <span className="pill" onClick={() => setView('list')}>← Back</span>
          <span className="pill sel" onClick={() => { setForm((f) => ({ ...f, person_name: sel })); setView('add'); }}>+ Entry</span>
        </div>
        <div className="section"><div className="card pad">
          <div className="title" style={{ fontSize: 16, fontWeight: 600 }}>{sel}</div>
          <div className={'mono ' + (out > 0 ? 'warn' : out < 0 ? 'pos' : 'muted')} style={{ fontSize: 12, marginTop: 4 }}>
            {out > 0 ? 'owes you ' + fmtAmt(out) : out < 0 ? 'you owe ' + fmtAmt(Math.abs(out)) : 'settled ✓'}
          </div>
          <div className="tiles three" style={{ marginTop: 12 }}>
            <div className="tile"><div className="label">Given</div><div className="value warn">{fmtCompact(p.given)}</div></div>
            <div className="tile"><div className="label">Received</div><div className="value pos">{fmtCompact(p.received)}</div></div>
            <div className="tile"><div className="label">Balance</div><div className="value">{fmtCompact(Math.abs(out))}</div></div>
          </div>
        </div></div>
        <div className="section"><div className="card">
          {entries.map((e) => (
            <div className="row" key={e.id}>
              <div className="left">
                <div className={'title ' + (e.direction === 'given' ? 'warn' : 'pos')}>{e.direction === 'given' ? '▲ Gave' : '▼ Got back'} {fmtAmt(e.amount)}</div>
                <div className="sub">{fmtDate(e.created_at)} · {e.mode}{e.notes ? ' · ' + e.notes : ''}</div>
              </div>
              <button className="pill" style={{ padding: '2px 8px', fontSize: 9 }} onClick={() => onDelete(e.id)}>✕</button>
            </div>
          ))}
        </div></div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="section">
        <div className="card pad spread">
          <span className="eyebrow">Total outstanding</span>
          <span className="mono warn" style={{ fontSize: 15, fontWeight: 700 }}>{fmtAmt(totalOut)}</span>
        </div>
      </div>
      <div className="section">
        <div className="section-title"><span>People</span><span className="pill sel" onClick={() => setView('add')}>+ New</span></div>
        <div className="card">
          {people.length === 0 && <div className="empty">No udhari yet</div>}
          {people.map((p) => (
            <div className="row" key={p.name} style={{ cursor: 'pointer' }} onClick={() => { setSel(p.name); setView('person'); }}>
              <div className="left">
                <div className="title">{p.name}</div>
                <div className="sub">Gave {fmtCompact(p.given)}{p.received > 0 ? ' · Back ' + fmtCompact(p.received) : ''}</div>
              </div>
              <div className={'amt ' + (p.out > 0 ? 'warn' : p.out < 0 ? 'pos' : 'muted')}>{p.out > 0 ? fmtAmt(p.out) : p.out < 0 ? '−' + fmtAmt(Math.abs(p.out)) : '✓'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ Provision envelopes ════════════════════════ */
function ProvisionScreen({ provisionStates, allBanks, onAccrue, onFlush, onCreate, onDelete }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', target_amount: '', already_saved: '', account: '', notes: '' });
  const [accrueFor, setAccrueFor] = useState(null);
  const [accAmt, setAccAmt] = useState('');
  const [accFrom, setAccFrom] = useState('');

  const create = async () => {
    if (!form.name || !form.target_amount) return;
    await onCreate(form);
    setForm({ name: '', target_amount: '', already_saved: '', account: '', notes: '' });
    setShowNew(false);
  };
  const doAccrue = async (ps) => {
    if (!(parseFloat(accAmt) > 0)) return;
    await onAccrue(ps, accAmt, accFrom || allBanks[0]);
    setAccrueFor(null); setAccAmt(''); setAccFrom('');
  };

  return (
    <div className="fade-in section">
      <div className="section-title" style={{ paddingTop: 0 }}>
        <span>Provision envelopes</span>
        <span className="pill sel" onClick={() => setShowNew((s) => !s)}>+ New</span>
      </div>

      {showNew && (
        <div className="card pad stack" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="Name (e.g. Emergency Fund)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="input" type="number" placeholder="Target ₹" value={form.target_amount} onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))} />
          <input className="input" type="number" placeholder="Already saved ₹ (optional)" value={form.already_saved} onChange={(e) => setForm((f) => ({ ...f, already_saved: e.target.value }))} />
          <select className="input" value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}>
            <option value="">Account (optional)</option>{allBanks.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button className="btn btn-primary btn-block" disabled={!form.name || !form.target_amount} onClick={create}>Create envelope</button>
        </div>
      )}

      {provisionStates.length === 0 && <div className="empty">No envelopes yet</div>}

      {provisionStates.map((ps) => (
        <div className="card pad" key={ps.prov.id} style={{ marginBottom: 12 }}>
          <div className="spread">
            <div><div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{ps.prov.name}</div>
              {ps.prov.notes && <div className="sub">{ps.prov.notes}</div>}</div>
            <span className="mono" style={{ fontWeight: 700, color: ps.pct >= 100 ? 'var(--green)' : ps.pct > 50 ? 'var(--amber)' : 'var(--red)' }}>{ps.pct}%</span>
          </div>
          <div className="bar" style={{ marginTop: 10 }}><span style={{ width: ps.pct + '%', background: ps.pct >= 100 ? 'var(--green)' : ps.pct > 50 ? 'var(--amber)' : 'var(--red)' }} /></div>
          <div className="tiles three" style={{ marginTop: 12 }}>
            <div className="tile"><div className="label">Target</div><div className="value">{fmtCompact(ps.A)}</div></div>
            <div className="tile"><div className="label">Saved</div><div className="value pos">{fmtCompact(ps.B)}</div></div>
            <div className="tile"><div className="label">Net blocked</div><div className="value info">{fmtCompact(ps.C)}</div></div>
          </div>
          <div className="cluster" style={{ marginTop: 12 }}>
            <span className="pill sel" onClick={() => { setAccrueFor(ps.prov.id); setAccFrom(ps.prov.account || allBanks[0] || 'Cash'); }}>+ Accrue</span>
            <span className="pill sel amber" onClick={() => onFlush(ps)}>Flush</span>
            <span className="pill" onClick={() => onDelete(ps.prov.id)}>✕ Delete</span>
          </div>
          {accrueFor === ps.prov.id && (
            <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div className="cluster">
                <input className="input" style={{ flex: 1 }} type="number" placeholder="Amount ₹" value={accAmt} onChange={(e) => setAccAmt(e.target.value)} />
                <select className="input" style={{ flex: 1 }} value={accFrom} onChange={(e) => setAccFrom(e.target.value)}>{allBanks.map((b) => <option key={b} value={b}>{b}</option>)}</select>
              </div>
              <div className="cluster">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => doAccrue(ps)}>Save</button>
                <button className="btn btn-ghost" onClick={() => setAccrueFor(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════ Site Ledger (Tally report) ════════════════════════ */
function SiteLedgerReport({ txns, siteOpenings }) {
  const sites = useMemo(() => listSites(txns), [txns]);
  const [site, setSite] = useState('');
  useEffect(() => { if (!site && sites.length) setSite(sites[0]); }, [sites]);

  const r = useMemo(
    () => computeSiteLedger(txns, { site: site || null, openings: (siteOpenings && siteOpenings[site]) || {} }),
    [txns, site, siteOpenings]
  );
  const maxCat = r.categories.length ? r.categories[0].total : 1;

  return (
    <div className="fade-in">
      <div className="section">
        <div className="section-title" style={{ paddingTop: 0 }}>Site Ledger · Tally</div>
        <div className="cluster">
          {sites.length === 0 && <span className="muted mono" style={{ fontSize: 12 }}>No site transactions yet</span>}
          {sites.map((s) => <span key={s} className={'pill' + (site === s ? ' sel' : '')} onClick={() => setSite(s)}>{s}</span>)}
        </div>
      </div>

      <div className="section">
        <div className="tiles three">
          <div className="tile"><div className="label">Received</div><div className="value pos">{fmtCompact(r.totalReceived)}</div></div>
          <div className="tile"><div className="label">Spent</div><div className="value neg">{fmtCompact(r.totalSpent)}</div></div>
          <div className="tile"><div className="label">Net</div><div className="value">{fmtCompact(r.netPosition)}</div></div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Handlers ({r.users.length})</div>
        <div className="card">
          {r.users.length === 0 && <div className="empty">No handler activity</div>}
          {r.users.map((u) => (
            <div className="row" key={u.name}>
              <div className="left">
                <div className="title">{u.name}</div>
                <div className="sub">open {fmtCompact(u.opening)} · recv {fmtCompact(u.received)} · spent {fmtCompact(u.spent)}{u.given ? ' · returned ' + fmtCompact(u.given) : ''}</div>
              </div>
              <div className={'amt ' + (u.closing < 0 ? 'neg' : 'pos')}>{fmtAmt(u.closing)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-title">By category</div>
        <div className="card pad stack">
          {r.categories.length === 0 && <div className="empty">No expenses</div>}
          {r.categories.map((c) => (
            <div key={c.category}>
              <div className="spread" style={{ marginBottom: 5 }}>
                <span className="mono" style={{ fontSize: 12 }}>{c.category}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{fmtAmt(c.total)}</span>
              </div>
              <div className="bar"><span style={{ width: Math.round((c.total / maxCat) * 100) + '%' }} /></div>
            </div>
          ))}
        </div>
        <p className="mono muted" style={{ fontSize: 10, marginTop: 10 }}>
          Opening balances per handler come from settings key <span className="info">site_openings</span> (per site). Funds in (+), spend (−), returns (−).
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════ App root ════════════════════════ */
function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState('dash');
  const [quickAdd, setQuickAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('jbf_theme') || 'terminal');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  useEffect(() => {
    db.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('jbf_theme', theme); }, [theme]);

  const [d, reload] = useData(session);

  /* Dynamic account lists */
  const allBanks = useMemo(() => [...SEED_BANKS, ...d.customAccounts.filter((a) => a.type === 'bank' && !a.archived).map((a) => a.name)], [d.customAccounts]);
  const allCC = useMemo(() => [...SEED_CC, ...d.customAccounts.filter((a) => a.type === 'cc' && !a.archived).map((a) => a.name)], [d.customAccounts]);
  const allBanksH = useMemo(() => [...SEED_BANKS, ...d.customAccounts.filter((a) => a.type === 'bank').map((a) => a.name)], [d.customAccounts]);
  const allCCH = useMemo(() => [...SEED_CC, ...d.customAccounts.filter((a) => a.type === 'cc').map((a) => a.name)], [d.customAccounts]);
  const allAccounts = useMemo(() => [...allBanks, ...allCC], [allBanks, allCC]);

  /* Memoized engine derivations (perf: no recompute on every keystroke) */
  const derived = useMemo(() => {
    const balances = computeBalances(d.opening, d.txns, allBanksH, allCCH);
    const liquid = computeLiquid(balances, allBanks);
    const totalCC = computeTotalCC(balances, allCC);
    const provisionStates = computeProvisions(d.recurring, d.txns);
    const netBlocked = round2(provisionStates.reduce((s, p) => s + p.C, 0));
    const spendable = Math.max(0, round2(liquid - totalCC - netBlocked));
    const udhariOut = computeUdhariOut(d.udhari);
    const groups = computeLedgerGroups(balances, allBanksH, allCCH);
    const health = computeBooksHealth(d.txns);
    return { balances, liquid, totalCC, netBlocked, spendable, udhariOut, groups, health, provisionStates };
  }, [d.opening, d.txns, d.recurring, d.udhari, allBanks, allCC, allBanksH, allCCH]);

  const addTxn = useCallback(async (txn) => {
    const de = tallyMiddleware(txn, allBanks, allCC);
    const payload = { ...txn, user_id: session?.user?.id || null, party_name: null, tower: txn.tower || null, dr_ledger: de.dr_ledger || null, cr_ledger: de.cr_ledger || null };
    if (!navigator.onLine) {
      const q = JSON.parse(localStorage.getItem('jbf_v3_offline_queue') || '[]');
      q.push({ id: uid4(), payload });
      localStorage.setItem('jbf_v3_offline_queue', JSON.stringify(q));
      showToast('📵 Offline — queued');
      return;
    }
    const { error } = await db.from('transactions').insert([payload]);
    if (error) { showToast('⚠ ' + (error.message || 'DB error')); return; }
    showToast('✓ ' + fmtAmt(txn.amount) + ' logged');
    reload();
  }, [allBanks, allCC, session, reload]);

  const voidTxn = useCallback(async (t) => {
    const { error } = await db.from('transactions').update({ status: 'voided' }).eq('id', t.id);
    if (!error) { showToast('↩ Voided'); reload(); } else showToast('⚠ ' + error.message);
  }, [reload]);

  /* Udhari (memory-only ledger — no balance impact) */
  const addUdhari = useCallback(async (entry) => {
    const created_at = entry.txn_date ? entry.txn_date + 'T06:30:00.000Z' : new Date().toISOString();
    const payload = {
      person_name: entry.person_name.trim(), amount: round2(parseFloat(entry.amount)),
      direction: entry.direction, mode: entry.mode || 'Cash', notes: entry.notes || null,
      created_at, user_id: session?.user?.id || null,
    };
    const { error } = await db.from('udhari').insert([payload]);
    if (!error) { showToast('✓ Udhari saved — ' + entry.person_name); reload(); }
    else showToast('⚠ ' + (error.message || 'DB error'));
  }, [session, reload]);

  const deleteUdhari = useCallback(async (id) => {
    const { error } = await db.from('udhari').delete().eq('id', id);
    if (!error) { showToast('↩ Entry removed'); reload(); } else showToast('⚠ ' + error.message);
  }, [reload]);

  /* Provision envelopes (recurring rows) + virtual accrue/flush txns */
  const addEnvelope = useCallback(async (form) => {
    const payload = {
      name: form.name, target_amount: round2(parseFloat(form.target_amount) || 0),
      already_saved: round2(parseFloat(form.already_saved) || 0), account: form.account || null,
      frequency: form.frequency || 'monthly', notes: form.notes || null,
      is_provision: true, active: true, user_id: session?.user?.id || null,
    };
    const { error } = await db.from('recurring').insert([payload]);
    if (!error) { showToast('✓ Envelope created'); reload(); } else showToast('⚠ ' + (error.message || 'DB error'));
  }, [session, reload]);

  const deleteEnvelope = useCallback(async (id) => {
    const { error } = await db.from('recurring').delete().eq('id', id);
    if (!error) { showToast('↩ Deleted'); reload(); } else showToast('⚠ ' + error.message);
  }, [reload]);

  const accrue = useCallback(async (ps, amount, from) => {
    await addTxn({
      domain: 'Personal', type: 'Provision_Accrue', amount: round2(parseFloat(amount)),
      from_account: from || allBanks[0] || 'Cash', category: ps.prov.name,
      particulars: '[ENV:' + ps.prov.id + '] Accrue → ' + ps.prov.name,
      status: 'complete', source: 'provision', created_at: new Date().toISOString(),
    });
  }, [addTxn, allBanks]);

  const flush = useCallback(async (ps) => {
    if (ps.C <= 0) { showToast('⚠ Nothing to flush'); return; }
    await addTxn({
      domain: 'Personal', type: 'Provision_Flush', amount: round2(ps.C),
      from_account: ps.prov.account || allBanks[0] || 'Cash', category: ps.prov.name,
      particulars: '[ENV:' + ps.prov.id + '] Flush → ' + ps.prov.name,
      status: 'complete', source: 'provision', created_at: new Date().toISOString(),
    });
  }, [addTxn, allBanks]);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  if (authLoading) return <div className="empty" style={{ paddingTop: 80 }}>Authenticating…</div>;
  if (!session) return <Login />;

  return (
    <Boundary>
      <header className="app-header">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => setTab('dash')}><span className="dot" /> JB Finance</div>
        <div className="bal">{fmtCompact(derived.spendable)}</div>
      </header>
      <main className="main">
        {d.loading && <div className="empty">Loading…</div>}
        {!d.loading && tab === 'dash' && <Dashboard d={d} derived={derived} setTab={setTab} />}
        {!d.loading && tab === 'log' && <Log d={d} onVoid={voidTxn} />}
        {!d.loading && tab === 'udhari' && <UdhariScreen udhari={d.udhari} allBanks={allBanks} onAdd={addUdhari} onDelete={deleteUdhari} />}
        {!d.loading && tab === 'provision' && <ProvisionScreen provisionStates={derived.provisionStates} allBanks={allBanks} onAccrue={accrue} onFlush={flush} onCreate={addEnvelope} onDelete={deleteEnvelope} />}
        {!d.loading && tab === 'site_ledger' && <SiteLedgerReport txns={d.txns} siteOpenings={d.siteOpenings} />}
        {!d.loading && tab === 'add' && <div className="section"><button className="btn btn-primary btn-block" onClick={() => setQuickAdd(true)}>+ New entry</button></div>}
        {!d.loading && tab === 'more' && <More session={session} theme={theme} setTheme={setTheme} setTab={setTab} />}
      </main>

      {tab !== 'add' && <button className="fab" aria-label="Add" onClick={() => setQuickAdd(true)}>＋</button>}
      {quickAdd && <AddSheet onSave={addTxn} onClose={() => setQuickAdd(false)} allBanks={allBanks} allCC={allCC} allAccounts={allAccounts} />}
      <TabBar tab={tab} setTab={setTab} />
      {toast && <div className="toast">{toast}</div>}
    </Boundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
