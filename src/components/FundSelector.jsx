import { useState, useEffect, useRef } from 'react';
import { FUNDS } from '../config/funds';

const BASE = import.meta.env.BASE_URL;
const STORAGE_KEY = 'custom_funds';
const TOKEN_KEY = 'gh_pat';
const REPO = 'nattachai290/fund-thai';
const WORKFLOW = 'daily-update.yml';

function loadCustomFunds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveCustomFunds(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function FundSelector({ selected, onChange, onCustomFundsChange }) {
  const [customFunds, setCustomFunds] = useState(loadCustomFunds);
  const [allSecFunds, setAllSecFunds] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE}data/_proj_id_cache.json`)
      .then((r) => r.json())
      .then((data) => setAllSecFunds(Object.keys(data).sort()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    onCustomFundsChange?.(customFunds);
  }, [customFunds]);

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

  const defaultCodes = FUNDS.map((f) => f.code);
  const allTracked = [...defaultCodes, ...customFunds];

  const filtered = query.trim().length < 1
    ? []
    : allSecFunds
        .filter((c) => c.toUpperCase().includes(query.toUpperCase()))
        .slice(0, 50);

  const addCustomFund = (code) => {
    if (allTracked.includes(code)) return;
    const next = [...customFunds, code];
    setCustomFunds(next);
    saveCustomFunds(next);
    onChange([...selected, code]);
    setQuery('');
    setOpen(false);
  };

  const removeCustomFund = (code) => {
    const next = customFunds.filter((c) => c !== code);
    setCustomFunds(next);
    saveCustomFunds(next);
    onChange(selected.filter((c) => c !== code));
  };

  const toggle = (code) => {
    if (selected.includes(code)) onChange(selected.filter((c) => c !== code));
    else onChange([...selected, code]);
  };

  const all = selected.length === allTracked.length;
  const toggleAll = () => onChange(all ? [] : allTracked);

  const triggerFetch = async (token) => {
    setFetchStatus('loading');
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: { extra_funds: customFunds.join(',') },
          }),
        }
      );
      if (res.status === 204) {
        setFetchStatus('ok');
        setTimeout(() => setFetchStatus(null), 4000);
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setFetchStatus({ error: e.message });
      setTimeout(() => setFetchStatus(null), 5000);
    }
  };

  const handleFetch = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) { triggerFetch(token); return; }
    setShowTokenModal(true);
  };

  const submitToken = () => {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    setShowTokenModal(false);
    setTokenInput('');
    triggerFetch(t);
  };

  return (
    <>
      <div className="fund-selector">
        <div className="selector-header">
          <h2>เลือกกองทุน</h2>
          <div className="selector-header-actions">
            <button className="btn-toggle-all" onClick={toggleAll}>
              {all ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <button
              className={`btn-fetch ${fetchStatus === 'ok' ? 'btn-fetch-ok' : fetchStatus === 'loading' ? 'btn-fetch-loading' : ''}`}
              onClick={handleFetch}
              disabled={fetchStatus === 'loading'}
            >
              {fetchStatus === 'loading' ? 'กำลัง Fetch…' : fetchStatus === 'ok' ? '✓ ส่งแล้ว' : '⬇ Fetch'}
            </button>
          </div>
        </div>

        {fetchStatus?.error && (
          <p className="fetch-error">❌ {fetchStatus.error}</p>
        )}

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
          {customFunds.map((code) => (
            <span key={code} className={`chip chip-custom ${selected.includes(code) ? 'chip-active' : ''}`}>
              <button className="chip-label" onClick={() => toggle(code)}>{code}</button>
              <button className="chip-remove" onClick={() => removeCustomFund(code)} title="ลบออก">×</button>
            </span>
          ))}
        </div>

        <div className="fund-search-wrap">
          <input
            ref={inputRef}
            className="fund-search-input"
            type="text"
            placeholder="ค้นหากองทุน SEC เพื่อเพิ่ม เช่น LHESPORT, K-GOLD…"
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
                  className={`fund-search-item ${allTracked.includes(code) ? 'fund-search-item-added' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => allTracked.includes(code) ? null : addCustomFund(code)}
                >
                  {code}
                  {allTracked.includes(code) && <span className="item-badge">เพิ่มแล้ว</span>}
                </li>
              ))}
            </ul>
          )}
          {open && query.trim().length >= 1 && filtered.length === 0 && (
            <div className="fund-search-empty">ไม่พบกองทุน</div>
          )}
        </div>
      </div>

      {showTokenModal && (
        <div className="modal-backdrop" onClick={() => setShowTokenModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>GitHub Personal Access Token</h3>
            <p className="modal-desc">
              ต้องการ PAT ที่มีสิทธิ์ <code>workflow</code> เพื่อ trigger GitHub Actions<br />
              Token จะเก็บใน localStorage เท่านั้น
            </p>
            <input
              className="modal-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitToken()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setShowTokenModal(false)}>ยกเลิก</button>
              <button className="btn-modal-ok" onClick={submitToken}>บันทึกและ Fetch</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
