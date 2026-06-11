import { useState, useEffect, useCallback, useRef } from 'react';
import AuthButton from './components/AuthButton';
import FundChart from './components/FundChart';
import FundManager from './components/FundManager';
import RebalanceTab from './components/RebalanceTab';
import { initGoogleAuth } from './utils/googleAuth';
import { loadFundConfig, saveFundConfig, loadRebalancePlan, saveRebalancePlan } from './utils/googleDrive';
import { lookupProjId, fetchNAV } from './utils/secApi';
import { calculateMACD } from './utils/macd';
import './App.css';

const TABS = ['MACD', 'Portfolio', 'Rebalance'];

// Fill missing trading days with previous NAV so EMA treats each calendar day equally
function forwardFillTradingDays(navRows) {
  if (!navRows.length) return navRows;
  const filled = [];
  const start = new Date(navRows[0].date);
  const end = new Date(navRows[navRows.length - 1].date);
  const navMap = Object.fromEntries(navRows.map((r) => [r.date, r.nav]));
  let lastNav = navRows[0].nav;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day === 0 || day === 6) continue; // skip weekends
    const dateStr = d.toISOString().slice(0, 10);
    if (navMap[dateStr] != null) lastNav = navMap[dateStr];
    filled.push({ date: dateStr, nav: lastNav });
  }
  return filled;
}

function buildNavWithMacd(navRows) {
  const filled = forwardFillTradingDays(navRows);
  const macdData = calculateMACD(filled.map((r) => r.nav));
  // return only rows that have real NAV data (not filled), but with MACD from filled calc
  const filledMap = Object.fromEntries(filled.map((r, i) => [r.date, macdData[i]]));
  return navRows.map((row) => ({ ...row, ...(filledMap[row.date] ?? {}) }));
}

function fmt(v, decimals = 4) {
  return v == null ? '—' : Number(v).toFixed(decimals);
}
function fmtMoney(v, decimals = 2) {
  if (v == null) return '—';
  return Number(v).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false); // false = กำลัง init
  const [funds, setFunds] = useState([]);
  const [navData, setNavData] = useState({});
  const [loadingNav, setLoadingNav] = useState({});
  const [errorNav, setErrorNav] = useState({});
  const [activeTab, setActiveTab] = useState('MACD');
  const [showManager, setShowManager] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [editForm, setEditForm] = useState({ avgCost: '', unitBalance: '' });
  const [showExport, setShowExport] = useState(false);
  const [exportOpts, setExportOpts] = useState({ nav: true, unit: true });
  const [copied, setCopied] = useState(false);
  const [rebalancePlan, setRebalancePlan] = useState({});
  const rebalanceSaveTimer = useRef(null);

  useEffect(() => {
    initGoogleAuth((token) => {
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((info) => setUser({ name: info.name, email: info.email }))
        .catch(() => setUser({ name: '', email: '' }))
        .finally(() => setAuthReady(true));
    });
    // ถ้าไม่มี session เลย — หลัง 3 วิก็ถือว่า ready (แสดง login)
    const t = setTimeout(() => setAuthReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadFundConfig()
      .then((cfg) => setFunds(cfg ?? []))
      .catch((e) => console.error('loadFundConfig:', e));
    loadRebalancePlan()
      .then((plan) => setRebalancePlan(plan ?? {}))
      .catch((e) => console.error('loadRebalancePlan:', e));
  }, [user]);

  function handleRebalancePlanChange(plan) {
    setRebalancePlan(plan);
    clearTimeout(rebalanceSaveTimer.current);
    rebalanceSaveTimer.current = setTimeout(() => {
      saveRebalancePlan(plan).catch(console.error);
    }, 1500);
  }

  function handleSetPlanFields(code, fields) {
    setRebalancePlan((prev) => {
      const next = {
        ...prev,
        [code]: { action: 'hold', amount: '', sellMode: 'money', customNav: '', ...prev[code], ...fields },
      };
      clearTimeout(rebalanceSaveTimer.current);
      rebalanceSaveTimer.current = setTimeout(() => {
        saveRebalancePlan(next).catch(console.error);
      }, 1500);
      return next;
    });
  }

  const fetchFundNav = useCallback(async (fund, forceRefresh = false) => {
    // check sessionStorage cache first (valid for current browser session)
    const cacheKey = `nav_${fund.code}`;
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setNavData((p) => ({ ...p, [fund.code]: JSON.parse(cached) }));
          return;
        }
      } catch {}
    }

    setLoadingNav((p) => ({ ...p, [fund.code]: true }));
    setErrorNav((p) => ({ ...p, [fund.code]: null }));
    try {
      let projId = fund.projId;
      let classFundName = fund.classFundName;
      // lookup ใหม่ถ้า: ยังไม่มี projId หรือ classFundName ยังเป็นค่าที่ user กรอก (ไม่ใช่จาก API)
      if (!projId || classFundName === fund.code) {
        const result = await lookupProjId(fund);
        projId = result.projId ?? projId;
        if (!projId) throw new Error('ไม่พบ proj_id — ตรวจสอบ Project Info / Company Info');
        classFundName = result.classFundName ?? classFundName;
        setFunds((prev) => {
          const updated = prev.map((f) =>
            f.code === fund.code
              ? { ...f, projId, classFundName, isDividend: result.isDividend }
              : f
          );
          saveFundConfig(updated).catch(console.error);
          return updated;
        });
      }
      const rows = await fetchNAV(projId, classFundName);
      if (!rows.length) throw new Error('ไม่มีข้อมูล NAV');
      const data = buildNavWithMacd(rows);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
      setNavData((p) => ({ ...p, [fund.code]: data }));
    } catch (e) {
      setErrorNav((p) => ({ ...p, [fund.code]: e.message }));
    } finally {
      setLoadingNav((p) => ({ ...p, [fund.code]: false }));
    }
  }, []);

  useEffect(() => {
    funds.forEach((fund) => {
      if (!navData[fund.code] && !loadingNav[fund.code]) {
        fetchFundNav(fund);
      }
    });
  }, [funds]);

  function handlePortfolioEdit(code, field, value) {
    const updated = funds.map((f) =>
      f.code === code ? { ...f, [field]: value !== '' ? parseFloat(value) : null } : f
    );
    setFunds(updated);
    saveFundConfig(updated).catch(console.error);
  }

  function openEditPortfolio(fund) {
    setEditingCode(fund.code);
    setEditForm({ avgCost: fund.avgCost ?? '', unitBalance: fund.unitBalance ?? '', tags: fund.tags ?? [] });
  }

  function saveEditPortfolio() {
    setFunds((prev) => {
      const updated = prev.map((f) =>
        f.code === editingCode
          ? {
              ...f,
              avgCost: editForm.avgCost !== '' ? parseFloat(editForm.avgCost) : null,
              unitBalance: editForm.unitBalance !== '' ? parseFloat(editForm.unitBalance) : null,
              tags: editForm.tags,
            }
          : f
      );
      saveFundConfig(updated).catch(console.error);
      return updated;
    });
    setEditingCode(null);
  }

  function removeFund(code) {
    const updated = funds.filter((f) => f.code !== code);
    setFunds(updated);
    setNavData((p) => { const n = { ...p }; delete n[code]; return n; });
    saveFundConfig(updated).catch(console.error);
  }

  function handleAddRebalanceFund(item) {
    if (funds.find((f) => f.code === item.code)) return;
    const newFund = {
      code: item.code,
      name: item.name || item.code,
      projectInfo: item.projAbbr,
      companyInfo: '',
      classFundName: item.classFundName,
      projId: item.projId,
      isDividend: item.isDividend,
      rebalanceOnly: true,
      avgCost: null,
      unitBalance: null,
    };
    handleSaveFunds([...funds, newFund]);
  }

  function buildExportText() {
    return funds.map((f) => {
      const rows = navData[f.code];
      const lastNav = rows?.[rows.length - 1]?.nav;
      let line = f.code;
      if (exportOpts.nav && lastNav != null) line += ` nav=${fmt(lastNav)}`;
      if (exportOpts.unit && f.unitBalance != null) line += ` unit=${fmt(f.unitBalance)}`;
      return line;
    }).join('\n');
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildExportText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSaveFunds(newFunds) {
    setFunds(newFunds);
    setSavingDrive(true);
    try {
      await saveFundConfig(newFunds);
    } catch (e) {
      console.error('saveFundConfig:', e);
    } finally {
      setSavingDrive(false);
    }
    newFunds.forEach((fund) => {
      if (!navData[fund.code] && !loadingNav[fund.code]) {
        fetchFundNav(fund);
      }
    });
  }

  // ─── Auth loading / Login screen ────────────────────────────────────────────
  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h1>📈 Thai Fund MACD</h1>
          <p>ติดตาม MACD กองทุนรวมไทย — เข้าสู่ระบบเพื่อจัดการกองทุนของคุณ</p>
          {authReady
            ? <AuthButton user={null} onSignOut={() => {}} />
            : <p className="auth-loading">กำลังตรวจสอบ session…</p>
          }
        </div>
      </div>
    );
  }

  // ─── Portfolio calculations ─────────────────────────────────────────────────
  const portfolioFunds = funds.filter((f) => !f.rebalanceOnly);
  const portfolioRows = portfolioFunds.map((f) => {
    const rows = navData[f.code];
    const lastNav = rows?.[rows.length - 1]?.nav ?? null;
    const cost = f.avgCost ?? null;
    const units = f.unitBalance ?? null;
    const currentValue = lastNav != null && units != null ? lastNav * units : null;
    const costValue = cost != null && units != null ? cost * units : null;
    const pnl = currentValue != null && costValue != null ? currentValue - costValue : null;
    const pnlPct = pnl != null && costValue ? (pnl / costValue) * 100 : null;
    return { ...f, lastNav, currentValue, pnl, pnlPct };
  });

  const totalValue = portfolioRows.reduce((s, r) => s + (r.currentValue ?? 0), 0);
  const totalCost = portfolioFunds.reduce((s, f) => s + (f.avgCost ?? 0) * (f.unitBalance ?? 0), 0);

  // group by companyInfo
  const groups = [];
  const seen = new Set();
  for (const f of portfolioFunds) {
    const key = f.companyInfo || '';
    if (!seen.has(key)) { seen.add(key); groups.push(key); }
  }
  const groupedFunds = groups.map((key) => ({
    company: key,
    funds: portfolioRows.filter((r) => (r.companyInfo || '') === key && !r.rebalanceOnly),
  }));
  const totalPnl = totalValue - totalCost;

  return (
    <div className="app">
      <header className="app-header">
        <h1>📈 Thai Fund MACD</h1>
        <div className="header-right">
          <button className="btn btn-manage" onClick={() => setShowManager(true)}>
            ⚙️ จัดการกองทุน{savingDrive ? ' 💾' : ''}
          </button>
          <AuthButton
            user={user}
            onSignOut={() => { setUser(null); setFunds([]); setNavData({}); }}
          />
        </div>
      </header>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${activeTab === t ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t === 'MACD' ? '📊 MACD' : t === 'Portfolio' ? '💼 Portfolio' : '⚖️ Rebalance'}
          </button>
        ))}
      </div>

      {/* ── MACD Tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'MACD' && (
        <main className="charts-grid">
          {funds.length === 0 && (
            <div className="empty-state"><p>ยังไม่มีกองทุน — กด ⚙️ เพื่อเพิ่ม</p></div>
          )}
          {funds.map((fund) => {
            if (loadingNav[fund.code]) {
              return (
                <div key={fund.code} className="fund-card fund-card-loading">
                  <p>กำลังโหลด {fund.code}…</p>
                </div>
              );
            }
            if (errorNav[fund.code]) {
              return (
                <div key={fund.code} className="fund-card fund-card-error">
                  <h3>{fund.code}</h3>
                  <p>{errorNav[fund.code]}</p>
                  <button className="btn btn-retry" onClick={() => fetchFundNav(fund, true)}>
                    ลองใหม่
                  </button>
                </div>
              );
            }
            if (!navData[fund.code]?.length) return null;
            return (
              <FundChart
                key={fund.code}
                code={fund.code}
                name={fund.name}
                isDividend={fund.isDividend}
                data={navData[fund.code]}
              />
            );
          })}
        </main>
      )}

      {/* ── Portfolio Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'Portfolio' && (
        <main className="portfolio-main">
          {funds.length === 0 ? (
            <div className="empty-state"><p>ยังไม่มีกองทุน — กด ⚙️ เพื่อเพิ่ม</p></div>
          ) : (
            <>
              {/* Summary */}
              <div className="portfolio-summary">
                <div className="summary-card">
                  <span>มูลค่ารวม</span>
                  <strong>฿{fmtMoney(totalValue)}</strong>
                </div>
                <div className="summary-card">
                  <span>ต้นทุนรวม</span>
                  <strong>฿{fmtMoney(totalCost)}</strong>
                </div>
                <div className={`summary-card ${totalPnl >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>
                  <span>กำไร / ขาดทุน</span>
                  <strong>{totalPnl >= 0 ? '+' : ''}฿{fmtMoney(totalPnl)}</strong>
                </div>
                <button className="btn-export" onClick={() => setShowExport(true)}>⬇ Export</button>
              </div>

              {/* Grouped sections */}
              {groupedFunds.map(({ company, funds: gFunds }) => (
                <div key={company} className="port-group">
                  {company && <h3 className="port-group-title">{company}</h3>}
                  <div className="port-cards">
                    {gFunds.map((r) => {
                      const loading = loadingNav[r.code];
                      const rows = navData[r.code];
                      const lastDate = rows?.[rows.length - 1]?.date;
                      return (
                        <div key={r.code} className="port-card">
                          <div className="port-card-top">
                            <div className="port-card-identity">
                              <span className="port-code">{r.code}</span>
                              {r.isDividend && <span className="badge-div">ปันผล</span>}
                            </div>
                            <div className="port-card-actions">
                              <button className="btn-icon" onClick={() => openEditPortfolio(r)} title="แก้ไข">✏️</button>
                              <button className="btn-icon btn-icon-del" onClick={() => removeFund(r.code)} title="ลบ">🗑</button>
                            </div>
                          </div>
                          <p className="port-name">{r.name}</p>
                          <div className="port-card-nav">
                            <span className="port-nav-val">{loading ? '…' : fmt(r.lastNav)}</span>
                            {lastDate && <span className="nav-date">{lastDate}</span>}
                          </div>
                          <div className="port-card-stats">
                            <div className="port-stat">
                              <span>ต้นทุน</span>
                              <span>{r.avgCost != null ? fmt(r.avgCost) : '—'}</span>
                            </div>
                            <div className="port-stat">
                              <span>Units</span>
                              <span>{r.unitBalance != null ? fmt(r.unitBalance) : '—'}</span>
                            </div>
                            <div className="port-stat">
                              <span>มูลค่า</span>
                              <span>{r.currentValue != null ? `฿${fmtMoney(r.currentValue)}` : '—'}</span>
                            </div>
                            <div className={`port-stat ${r.pnl != null ? (r.pnl >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}`}>
                              <span>กำไร/ขาดทุน</span>
                              <span>
                                {r.pnl != null ? `${r.pnl >= 0 ? '+' : ''}฿${fmtMoney(r.pnl)}` : '—'}
                                {r.pnlPct != null && <em>{r.pnlPct >= 0 ? '+' : ''}{fmt(r.pnlPct, 2)}%</em>}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </main>
      )}

      {/* ── Rebalance Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'Rebalance' && (
        <RebalanceTab
          funds={funds}
          navData={navData}
          plan={rebalancePlan}
          onPlanChange={handleRebalancePlanChange}
          onSetPlanFields={handleSetPlanFields}
          onAddFund={handleAddRebalanceFund}
          onRemoveFund={removeFund}
        />
      )}

      {showExport && (
        <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && setShowExport(false)}>
          <div className="manager-panel edit-portfolio-panel">
            <div className="manager-header">
              <h2>Export ข้อมูล</h2>
              <button className="btn-close" onClick={() => setShowExport(false)}>✕</button>
            </div>
            <div className="add-fund-form">
              <label className="export-checkbox">
                <input type="checkbox" checked={exportOpts.nav} onChange={(e) => setExportOpts((p) => ({ ...p, nav: e.target.checked }))} />
                รวม NAV ล่าสุด
              </label>
              <label className="export-checkbox">
                <input type="checkbox" checked={exportOpts.unit} onChange={(e) => setExportOpts((p) => ({ ...p, unit: e.target.checked }))} />
                รวม Unit Balance
              </label>
              <pre className="export-preview">{buildExportText()}</pre>
              <button className="btn btn-add" onClick={handleCopy}>
                {copied ? '✓ Copied!' : '⎘ Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCode && (
        <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && setEditingCode(null)}>
          <div className="manager-panel edit-portfolio-panel">
            <div className="manager-header">
              <h2>แก้ไข {editingCode}</h2>
              <button className="btn-close" onClick={() => setEditingCode(null)}>✕</button>
            </div>
            <div className="add-fund-form">
              <label className="form-label">
                ราคาเฉลี่ย (Avg Cost)
                <input
                  className="form-input"
                  type="number"
                  step="0.0001"
                  value={editForm.avgCost}
                  placeholder="—"
                  onChange={(e) => setEditForm((p) => ({ ...p, avgCost: e.target.value }))}
                />
              </label>
              <label className="form-label">
                จำนวน Unit
                <input
                  className="form-input"
                  type="number"
                  step="0.0001"
                  value={editForm.unitBalance}
                  placeholder="—"
                  onChange={(e) => setEditForm((p) => ({ ...p, unitBalance: e.target.value }))}
                />
              </label>
              <div className="form-label">
                Tags
                <div className="tag-chips">
                  {(editForm.tags ?? []).map((t) => (
                    <span key={t} className="tag-chip">
                      {t}
                      <button className="tag-chip-del" onClick={() => setEditForm((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) }))}>×</button>
                    </span>
                  ))}
                  <input
                    className="tag-input"
                    placeholder="+ เพิ่ม tag แล้ว Enter"
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
                        e.preventDefault();
                        const v = e.target.value.trim();
                        setEditForm((p) => ({ ...p, tags: p.tags.includes(v) ? p.tags : [...p.tags, v] }));
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
              <button className="btn btn-add" onClick={saveEditPortfolio}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {showManager && (
        <FundManager
          funds={funds}
          onSave={handleSaveFunds}
          onClose={() => setShowManager(false)}
        />
      )}
    </div>
  );
}
