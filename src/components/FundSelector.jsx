import { FUNDS } from '../config/funds';

export default function FundSelector({ selected, onChange }) {
  const toggle = (code) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const all = selected.length === FUNDS.length;
  const toggleAll = () => onChange(all ? [] : FUNDS.map((f) => f.code));

  return (
    <div className="fund-selector">
      <div className="selector-header">
        <h2>เลือกกองทุน</h2>
        <button className="btn-toggle-all" onClick={toggleAll}>
          {all ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
        </button>
      </div>
      <div className="fund-chips">
        {FUNDS.map((f) => (
          <button
            key={f.code}
            className={`chip ${selected.includes(f.code) ? 'chip-active' : ''}`}
            onClick={() => toggle(f.code)}
            title={f.name}
          >
            {f.code}
          </button>
        ))}
      </div>
    </div>
  );
}
