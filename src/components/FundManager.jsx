import { useState } from 'react';

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

const EMPTY = { code: '', name: '', companyInfo: '' };

export default function FundManager({ funds, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  function setField(field, value) {
    setForm((p) => {
      const next = { ...p, [field]: value };
      if (field === 'code') {
        const auto = deriveCompanyInfo(value);
        if (auto && !p.companyInfo) next.companyInfo = auto;
      }
      return next;
    });
  }

  function addFund() {
    const code = form.code.trim().toUpperCase();
    if (!code) { setError('กรุณากรอก Fund Code'); return; }
    if (funds.find((f) => f.code === code)) { setError('มี fund นี้อยู่แล้ว'); return; }

    const projectInfo = deriveProjectInfo(code);
    const newFund = {
      code,
      name: form.name.trim() || code,
      projectInfo,
      companyInfo: form.companyInfo,
      classFundName: code,
      avgCost: null,
      unitBalance: null,
    };
    onSave([...funds, newFund]);
    setForm(EMPTY);
    setError('');
  }

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-panel">
        <div className="manager-header">
          <h2>จัดการกองทุน</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* ฟอร์มเพิ่มกองทุน */}
        <div className="add-fund-form">
          <h3>เพิ่มกองทุน</h3>
          {error && <p className="form-error">{error}</p>}

          <label className="form-label">
            Fund Code
            <input
              className="form-input"
              value={form.code}
              onChange={(e) => setField('code', e.target.value)}
              placeholder="เช่น BGOLD, K-USXNDQ-A(D)"
              onKeyDown={(e) => e.key === 'Enter' && addFund()}
            />
          </label>

          <label className="form-label">
            ชื่อกองทุน <span className="form-optional">(ถ้าไม่ใส่จะใช้ Fund Code)</span>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder={form.code || 'ไม่บังคับ'}
              onKeyDown={(e) => e.key === 'Enter' && addFund()}
            />
          </label>

          <label className="form-label">
            ธนาคาร / บลจ.
            <select
              className="form-input form-select"
              value={form.companyInfo}
              onChange={(e) => setField('companyInfo', e.target.value)}
            >
              {COMPANIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          <button className="btn btn-add" onClick={addFund}>+ เพิ่มกองทุน</button>
        </div>
      </div>
    </div>
  );
}
