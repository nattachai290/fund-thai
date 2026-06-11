import { useState, useEffect, useRef } from 'react';
import { searchFunds } from '../utils/secApi';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

const TAG_COLORS = ['#60a5fa','#f59e0b','#34d399','#f472b6','#a78bfa','#fb923c','#22d3ee','#84cc16','#e879f9','#f87171'];

function strColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function PieSection({ title, data, total }) {
  if (!data.length || total <= 0) return null;
  return (
    <div className="rebalance-chart-box">
      <p className="chart-label">{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `฿${fmtMoney(v)}`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
          <Legend formatter={(name, entry) => (
            <span style={{ color: '#e2e8f0', fontSize: '0.78rem' }}>
              {name} ({((entry.payload.value / total) * 100).toFixed(1)}%)
            </span>
          )} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AllocationCharts({ rows }) {
  const afterRows = rows.filter((r) => !r._new);
  const val = (r) => r.afterValue ?? r.currentValue ?? 0;
  const total = afterRows.reduce((s, r) => s + val(r), 0);
  if (total <= 0) return null;

  // ปันผล vs ไม่ปันผล
  const divData = [
    { name: 'ปันผล', value: afterRows.filter((r) => r.isDividend).reduce((s, r) => s + val(r), 0), color: '#f59e0b' },
    { name: 'ไม่ปันผล', value: afterRows.filter((r) => !r.isDividend).reduce((s, r) => s + val(r), 0), color: '#60a5fa' },
  ].filter((d) => d.value > 0);

  // by tag — each fund contributes to each of its tags
  const tagMap = {};
  for (const r of afterRows) {
    const tags = r.tags?.length ? r.tags : ['ไม่มีกลุ่ม'];
    for (const t of tags) {
      tagMap[t] = (tagMap[t] ?? 0) + val(r);
    }
  }
  const tagData = Object.entries(tagMap)
    .map(([name, value]) => ({ name, value, color: strColor(name) }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PieSection title="สัดส่วนหลัง Rebalance (ปันผล / ไม่ปันผล)" data={divData} total={total} />
      {tagData.length > 1 && <PieSection title="สัดส่วนหลัง Rebalance (แยก Tag)" data={tagData} total={total} />}
    </>
  );
}

export default function RebalanceTab({ funds, navData, plan, onPlanChange, onSetPlanFields, onAddFund, onRemoveFund, onUpdateTags, onUpdateGroup }) {

  const portfolioFunds = funds.filter((f) => !f.rebalanceOnly);
  const rebalanceOnlyFunds = funds.filter((f) => f.rebalanceOnly);
  const allFundCodes = funds.map((f) => f.code);

  function getEntry(code) {
    return plan[code] ?? { action: 'hold', amount: '', sellMode: 'money', customNav: '', done: false };
  }

  const rows = [...portfolioFunds, ...rebalanceOnlyFunds.map((f) => ({ ...f, _new: true }))].map((fund) => {
    const navRows = navData[fund.code];
    const fetchedNav = navRows?.[navRows.length - 1]?.nav ?? null;
    const entry = getEntry(fund.code);
    const lastNav = entry.customNav !== '' && parseFloat(entry.customNav) > 0
      ? parseFloat(entry.customNav)
      : fetchedNav;
    const units = fund.unitBalance ?? null;
    const currentValue = lastNav != null && units != null ? lastNav * units : null;
    const totalUnits = units ?? (currentValue != null && lastNav ? currentValue / lastNav : null);
    const rawAmt = parseFloat(entry.amount) || 0;
    const sellMoney = entry.sellMode === 'unit' && lastNav ? rawAmt * lastNav : rawAmt;
    let afterValue = currentValue;
    if (entry.action === 'sell' && currentValue != null) afterValue = Math.max(0, currentValue - sellMoney);
    if (entry.action === 'buy' && currentValue != null) afterValue = currentValue + rawAmt;
    if (fund._new) afterValue = entry.action === 'buy' ? rawAmt : 0;
    const afterUnits = afterValue != null && lastNav ? afterValue / lastNav : null;
    const sellValueDisplay = entry.action === 'sell' && entry.sellMode === 'unit' ? sellMoney : null;
    const navIsCustom = entry.customNav !== '' && parseFloat(entry.customNav) > 0;
    return { ...fund, lastNav, fetchedNav, currentValue, totalUnits, afterValue, afterUnits, entry, sellMoney, sellValueDisplay, navIsCustom };
  });

  const totalBefore = rows.reduce((s, r) => s + (r.currentValue ?? 0), 0);
  const totalAfter = rows.reduce((s, r) => s + (r.afterValue ?? r.currentValue ?? 0), 0);
  const totalSell = rows.filter((r) => r.entry.action === 'sell').reduce((s, r) => s + r.sellMoney, 0);
  const totalBuy = rows.filter((r) => r.entry.action === 'buy').reduce((s, r) => s + (parseFloat(r.entry.amount) || 0), 0);
  const cashDiff = totalSell - totalBuy;

  const actionRows = rows.filter((r) => r.entry.action !== 'hold');
  const doneCount = actionRows.filter((r) => r.entry.done).length;

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
        <div className={`summary-card ${cashDiff >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>
          <span>เงินสดสุทธิ</span>
          <strong>{cashDiff >= 0 ? '+' : '-'}฿{fmtMoney(Math.abs(cashDiff))}</strong>
        </div>
        <div className="summary-card">
          <span>มูลค่าหลัง</span>
          <strong>฿{fmtMoney(totalAfter)}</strong>
        </div>
        {actionRows.length > 0 && (
          <div className="summary-card">
            <span>ดำเนินการแล้ว</span>
            <strong style={{ color: doneCount === actionRows.length ? '#34d399' : '#94a3b8' }}>
              {doneCount}/{actionRows.length}
            </strong>
          </div>
        )}
      </div>

      <AllocationCharts rows={rows} />

      {/* Fund rows — 2-level: custom group → company */}
      {(() => {
        const topKeys = [];
        const topSeen = new Set();
        for (const r of rows) {
          const k = r._new ? '__new__' : (r.group || '');
          if (!topSeen.has(k)) { topSeen.add(k); topKeys.push(k); }
        }
        return topKeys.map((topKey) => {
          const topRows = rows.filter((r) => (r._new ? '__new__' : (r.group || '')) === topKey);
          const topLabel = topKey === '__new__' ? 'กองทุนใหม่' : topKey || 'ไม่มีกลุ่ม';
          const subKeys = [];
          const subSeen = new Set();
          for (const r of topRows) {
            const k = r.companyInfo || '';
            if (!subSeen.has(k)) { subSeen.add(k); subKeys.push(k); }
          }
          return (
            <div key={topKey} className="rebalance-top-group">
              <h2 className="rebalance-top-group-title">{topLabel}</h2>
              {subKeys.map((subKey) => {
                const subRows = topRows.filter((r) => (r.companyInfo || '') === subKey);
                return (
                  <div key={subKey} className="port-group">
                    {subKey && <h3 className="port-group-title">{subKey}</h3>}
                    <div className="rebalance-list">
                      {subRows.map((r) => (
                        <div key={r.code} className={`rebalance-row ${r._new ? 'rebalance-row-new' : ''} ${r.entry.done ? 'rebalance-row-done' : ''}`}>
                          <div className="rebalance-fund-info">
                            <div className="rebalance-fund-top">
                              <span className="port-code">{r.code}</span>
                              {r.isDividend && <span className="badge-div">ปันผล</span>}
                              {r._new && <span className="badge-new">กองใหม่</span>}
                              {r.entry.done && <span className="badge-done">✓ เสร็จแล้ว</span>}
                            </div>
                            <span className="port-name">{r.name}</span>
                            {!r._new && (
                              <input
                                className="rebalance-group-input"
                                value={r.group || ''}
                                placeholder="กลุ่มใหญ่…"
                                onChange={(e) => onUpdateGroup(r.code, e.target.value)}
                              />
                            )}
                            <div className="rebalance-tag-row">
                              {(r.tags ?? []).map((t) => (
                                <span key={t} className="tag-chip">
                                  {t}
                                  <button className="tag-chip-del" onClick={() => onUpdateTags(r.code, (r.tags ?? []).filter((x) => x !== t))}>×</button>
                                </span>
                              ))}
                              <input className="tag-input" placeholder="+ tag"
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
                                    e.preventDefault();
                                    const v = e.target.value.trim();
                                    const cur = r.tags ?? [];
                                    if (!cur.includes(v)) onUpdateTags(r.code, [...cur, v]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </div>
                            <div className="rebalance-nav-row">
                              <span className="rebalance-nav-label">NAV</span>
                              <input
                                className={`rebalance-nav-input ${r.navIsCustom ? 'nav-custom' : ''}`}
                                type="number" step="0.0001" min="0"
                                value={r.entry.customNav}
                                placeholder={r.fetchedNav != null ? fmt(r.fetchedNav) : '—'}
                                onChange={(e) => onSetPlanFields(r.code, { customNav: e.target.value })}
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
                                  onClick={() => {
                                    if (a === 'sell' && r.entry.action !== 'sell') {
                                      const defaultUnits = r.totalUnits != null ? String(Number(r.totalUnits.toFixed(4))) : '';
                                      onSetPlanFields(r.code, { action: 'sell', sellMode: 'unit', amount: defaultUnits, done: false });
                                    } else {
                                      onSetPlanFields(r.code, { action: a, done: false });
                                    }
                                  }}>
                                  {a === 'sell' ? 'ขาย' : a === 'buy' ? 'ซื้อ' : 'คงเดิม'}
                                </button>
                              ))}
                            </div>
                            {r.entry.action === 'sell' && (
                              <div className="sell-mode-toggle">
                                <button className={`sell-mode-btn ${r.entry.sellMode !== 'unit' ? 'active' : ''}`}
                                  onClick={() => onSetPlanFields(r.code, { sellMode: 'money' })}>฿ บาท</button>
                                <button className={`sell-mode-btn ${r.entry.sellMode === 'unit' ? 'active' : ''}`}
                                  onClick={() => onSetPlanFields(r.code, { sellMode: 'unit', amount: '' })}>หน่วย</button>
                              </div>
                            )}
                            {r.entry.action !== 'hold' && (
                              <div className="rebalance-input-wrap">
                                <input className="rebalance-amount-input" type="number"
                                  step={r.entry.action === 'sell' && r.entry.sellMode === 'unit' ? '1' : '100'}
                                  min="0" value={r.entry.amount}
                                  placeholder={r.entry.action === 'sell' && r.entry.sellMode === 'unit' ? 'จำนวน unit' : 'จำนวนเงิน (฿)'}
                                  onChange={(e) => onSetPlanFields(r.code, { amount: e.target.value })}
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
                            {r.entry.action !== 'hold' && (
                              <button className={`btn-done-toggle ${r.entry.done ? 'done' : ''}`}
                                onClick={() => onSetPlanFields(r.code, { done: !r.entry.done })}>
                                {r.entry.action === 'sell'
                                  ? (r.entry.done ? '✓ เงินเข้าแล้ว' : 'เงินเข้าแล้ว?')
                                  : (r.entry.done ? '✓ กองเข้าแล้ว' : 'กองเข้าแล้ว?')}
                              </button>
                            )}
                          </div>

                          {r._new && (
                            <button className="btn-icon btn-icon-del" style={{ alignSelf: 'flex-start' }}
                              onClick={() => onRemoveFund(r.code)}>🗑</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        });
      })()}

      <FundSearch existingCodes={allFundCodes} onAdd={onAddFund} />
    </div>
  );
}
