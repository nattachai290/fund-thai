import { useState, useEffect, useRef } from 'react';
import { searchFunds } from '../utils/secApi';

// ธนาคาร/บลจ. ที่รองรับ — ค่าคือ company_info ที่ใช้ใน SEC API
const COMPANIES = [
  { label: '— ไม่ระบุ —',                    value: '' },
  { label: 'กสิกรไทย (KASIKORN)',             value: 'KASIKORN' },
  { label: 'กรุงไทย (KRUNG THAI)',            value: 'KRUNG THAI' },
  { label: 'กรุงศรี (KRUNGSRI)',              value: 'KRUNGSRI' },
  { label: 'ไทยพาณิชย์ (SCB)',               value: 'SCB' },
  { label: 'บัวหลวง (BBL)',                   value: 'BBL' },
  { label: 'ทหารไทย (TMB)',                   value: 'TMB' },
  { label: 'ธนชาต (THANACHART)',              value: 'THANACHART' },
  { label: 'เกียรตินาคินภัทร (KIATNAKIN PHATRA)', value: 'KIATNAKIN PHATRA' },
  { label: 'ทิสโก้ (TISCO)',                  value: 'TISCO' },
  { label: 'วรรณ (ONE)',                      value: 'ONE' },
  { label: 'แลนด์ แอนด์ เฮ้าส์ (LAND AND HOUSES)', value: 'LAND AND HOUSES' },
  { label: 'อีสท์สปริง (EASTSPRING)',         value: 'EASTSPRING' },
  { label: 'อเบอร์ดีน (ABERDEEN)',            value: 'ABERDEEN' },
  { label: 'พรินซิเพิล (PRINCIPAL ASSET)',    value: 'PRINCIPAL ASSET' },
  { label: 'แอสเซท พลัส (ASSET PLUS)',        value: 'ASSET PLUS' },
  { label: 'เอ็มเอฟซี (MFC)',                 value: 'MFC' },
  { label: 'บางกอกแคปปิตอล (BANGKOK CAPITAL)', value: 'BANGKOK CAPITAL' },
  { label: 'ยูโอบี (UOB)',                    value: 'UOB' },
  { label: 'ดาโอ (DAOL)',                     value: 'DAOL' },
  { label: 'เอไอเอ (AIA)',                    value: 'AIA' },
  { label: 'ฟิลลิป (PHILLIP)',                value: 'PHILLIP' },
  { label: 'ฟินันซ่า (FINANSA)',              value: 'FINANSA' },
  { label: 'ทาลิส (TALIS)',                   value: 'TALIS' },
  { label: 'ซาวาคามิ (SAWAKAMI)',             value: 'SAWAKAMI' },
  { label: 'เอ็กซ์สปริง (XSPRING)',           value: 'XSPRING' },
  { label: 'เรนเนสซานซ์ (RENAISSANCE)',       value: 'RENAISSANCE' },
  { label: 'เมอร์ชั่น พาร์ทเนอร์ (MERCHANT PARTNERS)', value: 'MERCHANT PARTNERS' },
  { label: 'เฟิร์ส พลัส (FIRST PLUS)',        value: 'FIRST PLUS' },
  { label: 'ไทยจัดการทรัพย์ (THAI ASSET)',    value: 'THAI ASSET' },
  { label: 'สยาม ไนท์ (SIAM KNIGHT FUND)',    value: 'SIAM KNIGHT FUND' },
];

const PREFIX_COMPANY = [
  { prefix: 'KF',        value: 'KRUNGSRI' },
  { prefix: 'K-',        value: 'KASIKORN' },
  { prefix: 'SCB',       value: 'SCB' },
  { prefix: 'LH',        value: 'LAND AND HOUSES' },
  { prefix: 'TIS',       value: 'TISCO' },
  { prefix: 'KT',        value: 'KRUNG THAI' },
  { prefix: 'PRINCIPAL', value: 'PRINCIPAL ASSET' },
  { prefix: 'BGOLD',     value: 'BBL' },
  { prefix: 'B-',        value: 'BBL' },
  { prefix: 'ONE',       value: 'ONE' },
  { prefix: 'TMB',       value: 'TMB' },
  { prefix: 'EASTSPRING',value: 'EASTSPRING' },
  { prefix: 'ASP',       value: 'ASSET PLUS' },
  { prefix: 'MFC',       value: 'MFC' },
  { prefix: 'UOB',       value: 'UOB' },
  { prefix: 'DAOL',      value: 'DAOL' },
  { prefix: 'TALIS',     value: 'TALIS' },
];

function deriveCompanyInfo(code) {
  const upper = code.toUpperCase();
  for (const { prefix, value } of PREFIX_COMPANY) {
    if (upper.startsWith(prefix.toUpperCase())) return value;
  }
  return '';
}

// auto-derive projectInfo จาก fund code
// ตัด class suffix เช่น -A(D), -B(D), -RD, -AR ออก
function deriveProjectInfo(code) {
  // มี parentheses: K-USXNDQ-A(D) → K-USXNDQ, SCBSEMI(A) → SCBSEMI
  const parenIdx = code.indexOf('(');
  if (parenIdx > 0) {
    const beforeParen = code.slice(0, parenIdx);
    const lastDash = beforeParen.lastIndexOf('-');
    if (lastDash > 0) return beforeParen.slice(0, lastDash);
    return beforeParen; // ไม่มี dash เช่น SCBSEMI(A)
  }
  // suffix 1-2 ตัวอักษร เช่น -D, -A, -RD, -AR, -RA
  const suffix = code.match(/^(.+)-([A-Z]{1,2})$/);
  if (suffix) return suffix[1];
  return code;
}

export default function FundManager({ funds, onSave, onClose }) {
  const [company, setCompany] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!company || keyword.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const items = await searchFunds(company, keyword);
        setResults(items.filter((it) => !funds.find((f) => f.code === it.code)));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [company, keyword]);

  function addFund(item) {
    if (funds.find((f) => f.code === item.code)) { setError('มี fund นี้อยู่แล้ว'); return; }
    const defaultName = item.classFundName === 'main'
      ? item.projAbbr
      : `${item.name} (${item.classFundName})`;
    const newFund = {
      code: item.code,
      name: defaultName || item.code,
      projectInfo: item.projAbbr,
      companyInfo: company,
      classFundName: item.classFundName,
      projId: item.projId,
      isDividend: item.isDividend,
      avgCost: null,
      unitBalance: null,
    };
    onSave([...funds, newFund]);
    setKeyword('');
    setResults([]);
    setError('');
  }

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-panel">
        <div className="manager-header">
          <h2>เพิ่มกองทุน</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="add-fund-form">
          {error && <p className="form-error">{error}</p>}

          {/* Step 1: เลือก บลจ. */}
          <label className="form-label">
            1. เลือก ธนาคาร / บลจ.
            <select
              className="form-input form-select"
              value={company}
              onChange={(e) => { setCompany(e.target.value); setKeyword(''); setResults([]); }}
            >
              {COMPANIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          {/* Step 2: ค้นหากองทุน */}
          {company && (
            <label className="form-label">
              2. ค้นหากองทุน
              <input
                className="form-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="พิมพ์ชื่อย่อ เช่น BGOLD, USXNDQ"
                autoFocus
              />
            </label>
          )}

          {/* Step 3: ผลลัพธ์ */}
          {searching && <p className="search-hint">กำลังค้นหา…</p>}
          {!searching && keyword.length >= 2 && results.length === 0 && (
            <p className="search-hint">ไม่พบกองทุน</p>
          )}
          {results.length > 0 && (
            <div className="search-results">
              {results.map((item) => (
                <button key={item.code} className="search-result-item" onClick={() => addFund(item)}>
                  <span className="result-code">{item.code}</span>
                  <span className="result-name">{item.name}</span>
                  {item.isDividend && <span className="badge-dividend">ปันผล</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
