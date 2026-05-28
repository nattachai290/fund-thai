import { useState, useEffect, useCallback } from 'react';
import AuthButton from './components/AuthButton';
import FundChart from './components/FundChart';
import FundManager from './components/FundManager';
import { initGoogleAuth } from './utils/googleAuth';
import { loadFundConfig, saveFundConfig } from './utils/googleDrive';
import { lookupProjId, fetchNAV } from './utils/secApi';
import { calculateMACD } from './utils/macd';
import './App.css';

const TABS = ['MACD', 'Portfolio'];

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
  }, [user]);

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
      if (!projId) {
        const result = await lookupProjId(fund);
        projId = result.projId;
        if (!projId) throw new Error('ไม่พบ proj_id — ตรวจสอบ Project Info / Company Info');
        setFunds((prev) => {
          const updated = prev.map((f) =>
            f.code === fund.code ? { ...f, projId, isDividend: result.isDividend } : f
          );
          saveFundConfig(updated).catch(console.error);
          return updated;
        });
      }
      const rows = await fetchNAV(projId, fund.classFundName);
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
    setEditForm({ avgCost: fund.avgCost ?? '', unitBalance: fund.unitBalance ?? '' });
  }

  function saveEditPortfolio() {
    setFunds((prev) => {
      const updated = prev.map((f) =>
        f.code === editingCode
          ? {
              ...f,
              avgCost: editForm.avgCost !== '' ? parseFloat(editForm.avgCost) : null,
              unitBalance: editForm.unitBalance !== '' ? parseFloat(editForm.unitBalance) : null,
            }
          : f
      );
      saveFundConfig(updated).catch(console.error);
      return updated;
    });
    setEditingCode(null);
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
  const portfolioRows = funds.map((f) => {
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
  const totalCost = funds.reduce((s, f) => s + (f.avgCost ?? 0) * (f.unitBalance ?? 0), 0);
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
            {t === 'MACD' ? '📊 MACD' : '💼 Portfolio'}
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
              <div className="portfolio-summary">
                <div className="summary-card">
                  <span>มูลค่ารวม</span>
                  <strong>฿{fmt(totalValue, 2)}</strong>
                </div>
                <div className="summary-card">
                  <span>ต้นทุนรวม</span>
                  <strong>฿{fmt(totalCost, 2)}</strong>
                </div>
                <div className={`summary-card ${totalPnl >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>
                  <span>กำไร / ขาดทุน</span>
                  <strong>{totalPnl >= 0 ? '+' : ''}฿{fmt(totalPnl, 2)}</strong>
                </div>
              </div>

              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>กองทุน</th>
                      <th>NAV ล่าสุด</th>
                      <th>ราคาเฉลี่ย</th>
                      <th>จำนวน Unit</th>
                      <th>มูลค่า</th>
                      <th>กำไร / ขาดทุน</th>
                      <th>%</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((fund) => {
                      const r = portfolioRows.find((x) => x.code === fund.code);
                      const loading = loadingNav[fund.code];
                      const rows = navData[fund.code];
                      const lastDate = rows?.[rows.length - 1]?.date;
                      return (
                        <tr key={fund.code}>
                          <td>
                            <div className="portfolio-fund-name">
                              <strong>{fund.code}</strong>
                              <span>{fund.name}</span>
                              {fund.isDividend && <span className="badge-dividend">ปันผล</span>}
                            </div>
                          </td>
                          <td>
                            <div className="portfolio-nav-cell">
                              <span>{loading ? '…' : fmt(r?.lastNav)}</span>
                              {lastDate && <span className="nav-date">{lastDate}</span>}
                            </div>
                          </td>
                          <td>{fund.avgCost != null ? fmt(fund.avgCost) : '—'}</td>
                          <td>{fund.unitBalance != null ? fmt(fund.unitBalance) : '—'}</td>
                          <td>{r?.currentValue != null ? `฿${fmt(r.currentValue, 2)}` : '—'}</td>
                          <td className={r?.pnl != null ? (r.pnl >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}>
                            {r?.pnl != null ? `${r.pnl >= 0 ? '+' : ''}฿${fmt(r.pnl, 2)}` : '—'}
                          </td>
                          <td className={r?.pnlPct != null ? (r.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}>
                            {r?.pnlPct != null ? `${r.pnlPct >= 0 ? '+' : ''}${fmt(r.pnlPct, 2)}%` : '—'}
                          </td>
                          <td>
                            <button className="btn-edit-portfolio" onClick={() => openEditPortfolio(fund)}>✏️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
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
