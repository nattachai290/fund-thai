import { useState, useEffect, useRef } from 'react';
import { searchFunds } from '../utils/secApi';

const COMPANIES = [
  { label: '— เลือก บลจ. —', value: '' },
  { label: 'กสิกรไทย (KASIKORN)', value: 'KASIKORN' },
  { label: 'กรุงไทย (KRUNG THAI)', value: 'KRUNG THAI' },
  { label: 'กรุงศรี (KRUNGSRI)', value: 'KRUNGSRI' },
  { label: 'ไทยพาณิชย์ (SCB)', value: 'SCB' },
  { label: 'บัวหลวง (BBL)', value: 'BBL' },
  { label: 'ทหารไทย (TMB)', value: 'TMB' },
  { label: 'ธนชาต (THANACHART)', value: 'THANACHART' },
  { label: 'เกียรตินาคินภัทร (KIATNAKIN PHATRA)', value: 'KIATNAKIN PHATRA' },
  { label: 'ทิสโก้ (TISCO)', value: 'TISCO' },
  { label: 'วรรณ (ONE)', value: 'ONE' },
  { label: 'แลนด์ แอนด์ เฮ้าส์ (LAND AND HOUSES)', value: 'LAND AND HOUSES' },
  { label: 'อีสท์สปริง (EASTSPRING)', value: 'EASTSPRING' },
  { label: 'อเบอร์ดีน (ABERDEEN)', value: 'ABERDEEN' },
  { label: 'พรินซิเพิล (PRINCIPAL ASSET)', value: 'PRINCIPAL ASSET' },
  { label: 'แอสเซท พลัส (ASSET PLUS)', value: 'ASSET PLUS' },
  { label: 'เอ็มเอฟซี (MFC)', value: 'MFC' },
  { label: 'ยูโอบี (UOB)', value: 'UOB' },
  { label: 'ดาโอ (DAOL)', value: 'DAOL' },
];

const fmt = (v, d = 4) => v == null ? '—' : Number(v).toFixed(d);
const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FundSearch({ existingCodes, onAdd }) {
  const [company, setCompany] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!company || keyword.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const items = await searchFunds(company, keyword);
        setResults(items.filter((it) => !existingCodes.includes(it.code)));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [company, keyword]);

  return (
    <div className="rebalance-search-box">
      <p className="rebalance-search-title">+ เพิ่มกองทุนใหม่ (จะโผล่ใน MACD เท่านั้น)</p>
      <div className="rebalance-search-row">
        <select className="form-input form-select rebalance-select" value={company}
          onChange={(e) => { setCompany(e.target.value); setKeyword(''); setResults([]); }}>
          {COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {company && (
          <input className="form-input rebalance-kw" value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="พิมพ์ชื่อย่อ…" autoFocus />
        )}
      </div>
      {searching && <p className="search-hint">กำลังค้นหา…</p>}
      {!searching && keyword.length >= 2 && results.length === 0 && <p className="search-hint">ไม่พบกองทุน</p>}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((item) => (
            <button key={item.code} className="search-result-item" onClick={() => { onAdd(item); setKeyword(''); setResults([]); }}>
              <span className="result-code">{item.code}</span>
              <span className="result-name">{item.name}</span>
              {item.isDividend && <span className="badge-div">ปันผล</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RebalanceTab({ funds, navData, plan, onPlanChange, onAddFund, onRemoveFund }) {

  const portfolioFunds = funds.filter((f) => !f.rebalanceOnly);
  const rebalanceOnlyFunds = funds.filter((f) => f.rebalanceOnly);
  const allFundCodes = funds.map((f) => f.code);

  function setPlanFields(code, fields) {
    onPlanChange({ ...plan, [code]: { action: 'hold', amount: '', sellMode: 'money', customNav: '', ...plan[code], ...fields } });
  }

  function getEntry(code) {
    return plan[code] ?? { action: 'hold', amount: '', sellMode: 'money', customNav: '' };
  }

  // คำนวณผล rebalance
  const rows = [...portfolioFunds, ...rebalanceOnlyFunds.map((f) => ({ ...f, _new: true }))].map((fund) => {
    const navRows = navData[fund.code];
    const fetchedNav = navRows?.[navRows.length - 1]?.nav ?? null;
    const entry = getEntry(fund.code);
    const lastNav = entry.customNav !== '' && parseFloat(entry.customNav) > 0
      ? parseFloat(entry.customNav)
      : fetchedNav;
    const units = fund.unitBalance ?? null;
    const currentValue = lastNav != null && units != null ? lastNav * units : null;
    const rawAmt = parseFloat(entry.amount) || 0;
    // sellMode: 'money' = ใส่เป็นบาท, 'unit' = ใส่เป็น unit แล้วคำนวณเป็นบาทจาก NAV
    const sellMoney = entry.sellMode === 'unit' && lastNav ? rawAmt * lastNav : rawAmt;
    let afterValue = currentValue;
    if (entry.action === 'sell' && currentValue != null) afterValue = Math.max(0, currentValue - sellMoney);
    if (entry.action === 'buy' && currentValue != null) afterValue = currentValue + rawAmt;
    if (fund._new) afterValue = entry.action === 'buy' ? rawAmt : 0;
    const afterUnits = afterValue != null && lastNav ? afterValue / lastNav : null;
    const sellValueDisplay = entry.action === 'sell' && entry.sellMode === 'unit' ? sellMoney : null;
    const navIsCustom = entry.customNav !== '' && parseFloat(entry.customNav) > 0;
    return { ...fund, lastNav, fetchedNav, currentValue, afterValue, afterUnits, entry, sellMoney, sellValueDisplay, navIsCustom };
  });

  const totalBefore = rows.reduce((s, r) => s + (r.currentValue ?? 0), 0);
  const totalAfter = rows.reduce((s, r) => s + (r.afterValue ?? r.currentValue ?? 0), 0);
  const totalSell = rows.filter((r) => r.entry.action === 'sell').reduce((s, r) => s + r.sellMoney, 0);
  const totalBuy = rows.filter((r) => r.entry.action === 'buy').reduce((s, r) => s + (parseFloat(r.entry.amount) || 0), 0);

  return (
    <div className="rebalance-main">
      {/* Summary */}
      <div className="portfolio-summary" style={{ position: 'relative' }}>
        <button className="btn-rebalance-clear" onClick={() => onPlanChange({})}>ล้างแผน</button>
        <div className="summary-card">
          <span>มูลค่าก่อน</span>
          <strong>฿{fmtMoney(totalBefore)}</strong>
        </div>
        <div className="summary-card">
          <span>ขายรวม</span>
          <strong style={{ color: '#f87171' }}>-฿{fmtMoney(totalSell)}</strong>
        </div>
        <div className="summary-card">
          <span>ซื้อรวม</span>
          <strong style={{ color: '#34d399' }}>+฿{fmtMoney(totalBuy)}</strong>
        </div>
        <div className="summary-card">
          <span>มูลค่าหลัง</span>
          <strong>฿{fmtMoney(totalAfter)}</strong>
        </div>
      </div>

      {/* Fund rows */}
      <div className="rebalance-list">
        {rows.map((r) => (
          <div key={r.code} className={`rebalance-row ${r._new ? 'rebalance-row-new' : ''}`}>
            <div className="rebalance-fund-info">
              <div className="rebalance-fund-top">
                <span className="port-code">{r.code}</span>
                {r.isDividend && <span className="badge-div">ปันผล</span>}
                {r._new && <span className="badge-new">กองใหม่</span>}
              </div>
              <span className="port-name">{r.name}</span>
              <div className="rebalance-nav-row">
                <span className="rebalance-nav-label">NAV</span>
                <input
                  className={`rebalance-nav-input ${r.navIsCustom ? 'nav-custom' : ''}`}
                  type="number"
                  step="0.0001"
                  min="0"
                  value={r.entry.customNav}
                  placeholder={r.fetchedNav != null ? fmt(r.fetchedNav) : '—'}
                  onChange={(e) => setPlanFields(r.code, { customNav: e.target.value })}
                />
                {!r._new && r.currentValue != null && (
                  <span className="rebalance-val">฿{fmtMoney(r.currentValue)}</span>
                )}
              </div>
            </div>

            <div className="rebalance-controls">
              <div className="rebalance-action-tabs">
                {(r._new ? ['buy', 'hold'] : ['sell', 'hold', 'buy']).map((a) => (
                  <button key={a}
                    className={`rebalance-action-btn ${r.entry.action === a ? `active-${a}` : ''}`}
                    onClick={() => setPlanFields(r.code, { action: a })}>
                    {a === 'sell' ? 'ขาย' : a === 'buy' ? 'ซื้อ' : 'คงเดิม'}
                  </button>
                ))}
              </div>
              {r.entry.action === 'sell' && (
                <div className="sell-mode-toggle">
                  <button
                    className={`sell-mode-btn ${r.entry.sellMode !== 'unit' ? 'active' : ''}`}
                    onClick={() => setPlanFields(r.code, { sellMode: 'money' })}>฿ บาท</button>
                  <button
                    className={`sell-mode-btn ${r.entry.sellMode === 'unit' ? 'active' : ''}`}
                    onClick={() => { setPlanFields(r.code, { sellMode: 'unit', amount: '' }) }}>หน่วย</button>
                </div>
              )}
              {r.entry.action !== 'hold' && (
                <div className="rebalance-input-wrap">
                  <input className="rebalance-amount-input"
                    type="number"
                    step={r.entry.action === 'sell' && r.entry.sellMode === 'unit' ? '1' : '100'}
                    min="0"
                    value={r.entry.amount}
                    placeholder={r.entry.action === 'sell' && r.entry.sellMode === 'unit' ? 'จำนวน unit' : 'จำนวนเงิน (฿)'}
                    onChange={(e) => setPlanFields(r.code, { amount: e.target.value })}
                  />
                  {r.sellValueDisplay != null && (
                    <span className="sell-unit-calc">= ฿{fmtMoney(r.sellValueDisplay)}</span>
                  )}
                </div>
              )}
              {r.entry.action !== 'hold' && r.afterValue != null && (
                <div className="rebalance-after">
                  <span>หลัง: ฿{fmtMoney(r.afterValue)}</span>
                  {r.afterUnits != null && <span>{fmt(r.afterUnits)} units</span>}
                </div>
              )}
            </div>

            {r._new && (
              <button className="btn-icon btn-icon-del" style={{ alignSelf: 'flex-start' }}
                onClick={() => onRemoveFund(r.code)}>🗑</button>
            )}
          </div>
        ))}
      </div>

      <FundSearch existingCodes={allFundCodes} onAdd={onAddFund} />
    </div>
  );
}
