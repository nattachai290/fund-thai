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

function buildNavWithMacd(navRows) {
  const macdData = calculateMACD(navRows.map((r) => r.nav));
  return navRows.map((row, i) => ({ ...row, ...macdData[i] }));
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

  const fetchFundNav = useCallback(async (fund) => {
    setLoadingNav((p) => ({ ...p, [fund.code]: true }));
    setErrorNav((p) => ({ ...p, [fund.code]: null }));
    try {
      let projId = fund.projId;
      if (!projId) {
        projId = await lookupProjId(fund);
        if (!projId) throw new Error('ไม่พบ proj_id — ตรวจสอบ Project Info / Company Info');
        setFunds((prev) => {
          const updated = prev.map((f) => (f.code === fund.code ? { ...f, projId } : f));
          saveFundConfig(updated).catch(console.error);
          return updated;
        });
      }
      const rows = await fetchNAV(projId);
      if (!rows.length) throw new Error('ไม่มีข้อมูล NAV');
      setNavData((p) => ({ ...p, [fund.code]: buildNavWithMacd(rows) }));
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
                  <button className="btn btn-retry" onClick={() => fetchFundNav(fund)}>
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
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((fund) => {
                      const r = portfolioRows.find((x) => x.code === fund.code);
                      const loading = loadingNav[fund.code];
                      return (
                        <tr key={fund.code}>
                          <td>
                            <div className="portfolio-fund-name">
                              <strong>{fund.code}</strong>
                              <span>{fund.name}</span>
                            </div>
                          </td>
                          <td>{loading ? '…' : fmt(r?.lastNav)}</td>
                          <td>{fmt(fund.avgCost)}</td>
                          <td>{fund.unitBalance ?? '—'}</td>
                          <td>{r?.currentValue != null ? `฿${fmt(r.currentValue, 2)}` : '—'}</td>
                          <td className={r?.pnl != null ? (r.pnl >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}>
                            {r?.pnl != null ? `${r.pnl >= 0 ? '+' : ''}฿${fmt(r.pnl, 2)}` : '—'}
                          </td>
                          <td className={r?.pnlPct != null ? (r.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg') : ''}>
                            {r?.pnlPct != null ? `${r.pnlPct >= 0 ? '+' : ''}${fmt(r.pnlPct, 2)}%` : '—'}
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
