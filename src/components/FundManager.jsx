import { useState } from 'react';

const EMPTY_FORM = {
  code: '',
  name: '',
  projectInfo: '',
  companyInfo: '',
  classFundName: '',
  avgCost: '',
  unitBalance: '',
};

export default function FundManager({ funds, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
    // auto-fill classFundName ถ้ายังไม่ได้กรอก
    if (field === 'code') {
      setForm((p) => ({
        ...p,
        code: value,
        classFundName: p.classFundName || value,
      }));
    }
  }

  function addFund() {
    const code = form.code.trim();
    const projectInfo = form.projectInfo.trim();
    if (!code || !projectInfo) {
      setError('กรุณากรอก Fund Code และ Project Info');
      return;
    }
    if (funds.find((f) => f.code === code)) {
      setError('มี fund นี้อยู่แล้ว');
      return;
    }
    const newFund = {
      code,
      name: form.name.trim() || code,
      projectInfo,
      companyInfo: form.companyInfo.trim(),
      classFundName: form.classFundName.trim() || code,
      avgCost: form.avgCost ? parseFloat(form.avgCost) : null,
      unitBalance: form.unitBalance ? parseFloat(form.unitBalance) : null,
    };
    onSave([...funds, newFund]);
    setForm(EMPTY_FORM);
    setError('');
  }

  function removeFund(code) {
    onSave(funds.filter((f) => f.code !== code));
  }

  function updatePortfolio(code, field, value) {
    onSave(
      funds.map((f) =>
        f.code === code ? { ...f, [field]: value ? parseFloat(value) : null } : f
      )
    );
  }

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-panel">
        <div className="manager-header">
          <h2>จัดการกองทุน</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* รายการกองทุน */}
        <div className="fund-list">
          {funds.length === 0 && <p className="empty-hint">ยังไม่มีกองทุน — เพิ่มด้านล่างได้เลย</p>}
          {funds.map((f) => (
            <div key={f.code} className="fund-row">
              <div className="fund-row-info">
                <strong>{f.code}</strong>
                <span>{f.name}</span>
              </div>
              <div className="fund-row-portfolio">
                <label>
                  Avg cost
                  <input
                    type="number"
                    step="0.0001"
                    value={f.avgCost ?? ''}
                    onChange={(e) => updatePortfolio(f.code, 'avgCost', e.target.value)}
                    placeholder="ราคาเฉลี่ย"
                  />
                </label>
                <label>
                  Units
                  <input
                    type="number"
                    step="0.0001"
                    value={f.unitBalance ?? ''}
                    onChange={(e) => updatePortfolio(f.code, 'unitBalance', e.target.value)}
                    placeholder="จำนวน unit"
                  />
                </label>
              </div>
              <button className="btn-remove" onClick={() => removeFund(f.code)}>🗑</button>
            </div>
          ))}
        </div>

        {/* ฟอร์มเพิ่มกองทุน */}
        <div className="add-fund-form">
          <h3>เพิ่มกองทุน</h3>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid">
            <label>
              Fund Code *
              <input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="เช่น K-USXNDQ-A(D)" />
            </label>
            <label>
              ชื่อกองทุน
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="ชื่อที่แสดงผล" />
            </label>
            <label>
              Project Info * <span className="hint">(proj_abbr_name)</span>
              <input value={form.projectInfo} onChange={(e) => set('projectInfo', e.target.value)} placeholder="เช่น K-USXNDQ" />
            </label>
            <label>
              Company Info <span className="hint">(ชื่อธนาคาร/บลจ.)</span>
              <input value={form.companyInfo} onChange={(e) => set('companyInfo', e.target.value)} placeholder="เช่น KASIKORN" />
            </label>
            <label>
              Class Fund Name <span className="hint">(fund_class_name)</span>
              <input value={form.classFundName} onChange={(e) => set('classFundName', e.target.value)} placeholder="ค่าเริ่มต้น = Fund Code" />
            </label>
          </div>
          <button className="btn btn-add" onClick={addFund}>+ เพิ่มกองทุน</button>
        </div>
      </div>
    </div>
  );
}
