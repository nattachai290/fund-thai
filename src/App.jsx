import { useState, useEffect } from 'react';
import FundSelector from './components/FundSelector';
import FundChart from './components/FundChart';
import { FUNDS } from './config/funds';
import './App.css';

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const [customFunds, setCustomFunds] = useState([]);
  const allFunds = [...FUNDS.map((f) => f.code), ...customFunds];
  const [selected, setSelected] = useState(FUNDS.map((f) => f.code));
  const [fundData, setFundData] = useState({});
  const [loading, setLoading] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState({});

  useEffect(() => {
    selected.forEach((code) => {
      if (fundData[code] !== undefined) return;
      setLoading((p) => ({ ...p, [code]: true }));
      const filename = code.replace(/[^a-zA-Z0-9-]/g, '_');
      fetch(`${BASE}data/${filename}.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        })
        .then((d) => {
          setFundData((p) => ({ ...p, [code]: d.data ?? [] }));
          if (d.lastUpdated) setLastUpdated(d.lastUpdated);
          setError((p) => ({ ...p, [code]: null }));
        })
        .catch((e) => {
          setError((p) => ({ ...p, [code]: e.message }));
          setFundData((p) => ({ ...p, [code]: [] }));
        })
        .finally(() => setLoading((p) => ({ ...p, [code]: false })));
    });
  }, [selected]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>📈 Thai Fund MACD</h1>
        {lastUpdated && <p className="last-updated">อัปเดตล่าสุด: {lastUpdated}</p>}
      </header>

      <FundSelector
        selected={selected}
        onChange={setSelected}
        onCustomFundsChange={setCustomFunds}
      />

      <main className="charts-grid">
        {selected.map((code) => {
          if (loading[code]) {
            return (
              <div key={code} className="fund-card fund-card-loading">
                <p>กำลังโหลด {code}…</p>
              </div>
            );
          }
          if (error[code] || !fundData[code]?.length) {
            return (
              <div key={code} className="fund-card fund-card-error">
                <h3>{code}</h3>
                <p>ยังไม่มีข้อมูล — กด Fetch เพื่อดึงข้อมูล</p>
                {error[code] && <small>{error[code]}</small>}
              </div>
            );
          }
          return <FundChart key={code} code={code} data={fundData[code]} />;
        })}
      </main>
    </div>
  );
}
