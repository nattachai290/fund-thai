import { useState, useEffect, useRef } from 'react';
import { FUNDS } from '../config/funds';

const BASE = import.meta.env.BASE_URL;

export default function FundSelector({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [allFunds, setAllFunds] = useState([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE}data/_proj_id_cache.json`)
      .then((r) => r.json())
      .then((data) => setAllFunds(Object.keys(data).sort()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target) && e.target !== inputRef.current) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query.trim().length < 1
    ? []
    : allFunds.filter((c) => c.toUpperCase().includes(query.toUpperCase())).slice(0, 50);

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

      <div className="fund-search-wrap">
        <input
          ref={inputRef}
          className="fund-search-input"
          type="text"
          placeholder="ค้นหากองทุน SEC เช่น LHESPORT, K-GOLD…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul className="fund-search-dropdown" ref={dropdownRef}>
            {filtered.map((code) => (
              <li
                key={code}
                className="fund-search-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setQuery(code); setOpen(false); }}
              >
                {code}
              </li>
            ))}
          </ul>
        )}
        {open && query.trim().length >= 1 && filtered.length === 0 && (
          <div className="fund-search-empty">ไม่พบกองทุน</div>
        )}
      </div>
    </div>
  );
}
