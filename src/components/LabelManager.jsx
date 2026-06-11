import { useState } from 'react';

export default function LabelManager({ funds, onUpdateGroup, onUpdateTags, onClose }) {
  const [tab, setTab] = useState('group');
  const [newGroup, setNewGroup] = useState('');
  const [editGroupName, setEditGroupName] = useState({}); // oldName → newName (pending rename)

  const portfolioFunds = funds.filter((f) => !f.rebalanceOnly);

  // ── derived data ──────────────────────────────────────────────────────────
  const allGroupNames = [...new Set(portfolioFunds.map((f) => f.group || '').filter(Boolean))];
  const allTagNames   = [...new Set(portfolioFunds.flatMap((f) => f.tags ?? []))];

  // ── group helpers ─────────────────────────────────────────────────────────
  function createGroup() {
    const name = newGroup.trim();
    if (!name || allGroupNames.includes(name)) return;
    setNewGroup('');
    // creating a group just registers the name; no fund moved yet
    // we store groups as a pseudo-fund-level concept; the name appears once a fund is assigned
    // for now just clear — user assigns funds via dropdown
  }

  function renameGroup(oldName, newName) {
    const n = newName.trim();
    if (!n || (n !== oldName && allGroupNames.includes(n))) return;
    portfolioFunds.forEach((f) => {
      if ((f.group || '') === oldName) onUpdateGroup(f.code, n);
    });
    setEditGroupName((p) => { const c = { ...p }; delete c[oldName]; return c; });
  }

  function deleteGroup(name) {
    portfolioFunds.filter((f) => (f.group || '') === name)
      .forEach((f) => onUpdateGroup(f.code, ''));
  }

  // ── tag helpers ───────────────────────────────────────────────────────────
  function renameTag(oldTag, newTag) {
    const n = newTag.trim();
    if (!n) return;
    portfolioFunds.forEach((f) => {
      if ((f.tags ?? []).includes(oldTag)) {
        const next = (f.tags ?? []).map((t) => t === oldTag ? n : t);
        onUpdateTags(f.code, next);
      }
    });
  }

  function deleteTag(tag) {
    portfolioFunds.forEach((f) => {
      if ((f.tags ?? []).includes(tag)) onUpdateTags(f.code, (f.tags ?? []).filter((t) => t !== tag));
    });
  }

  // groups derived from actual fund assignments + newly typed ones
  const displayGroups = allGroupNames.length > 0 ? allGroupNames : [];

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-panel label-manager-panel">
        <div className="manager-header">
          <h2>จัดการกลุ่ม & แท็ก</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* tabs */}
        <div className="label-tabs">
          <button className={`label-tab ${tab === 'group' ? 'active' : ''}`} onClick={() => setTab('group')}>⊞ กลุ่ม</button>
          <button className={`label-tab ${tab === 'tag' ? 'active' : ''}`} onClick={() => setTab('tag')}>🏷 แท็ก</button>
        </div>

        {/* ── GROUP TAB ──────────────────────────────────────────────────── */}
        {tab === 'group' && (
          <div className="label-content">
            {/* create new group */}
            <div className="label-create-row">
              <input className="form-input" value={newGroup}
                placeholder="ชื่อกลุ่มใหม่…"
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              />
              <button className="btn btn-add label-add-btn" onClick={createGroup}>+ สร้าง</button>
            </div>

            {/* existing groups */}
            {[...displayGroups, '__none__'].map((gKey) => {
              const isNone = gKey === '__none__';
              const groupFunds = portfolioFunds.filter((f) => isNone ? !(f.group) : (f.group || '') === gKey);
              if (isNone && groupFunds.length === 0 && displayGroups.length > 0) return null;
              const pendingName = editGroupName[gKey] ?? gKey;

              return (
                <div key={gKey} className="label-group-section">
                  <div className="label-group-header">
                    {isNone ? (
                      <span className="label-group-name dim">ไม่มีกลุ่ม ({groupFunds.length})</span>
                    ) : (
                      <>
                        <input
                          className="label-group-name-input"
                          value={pendingName === gKey ? gKey : pendingName}
                          onChange={(e) => setEditGroupName((p) => ({ ...p, [gKey]: e.target.value }))}
                          onBlur={() => editGroupName[gKey] && renameGroup(gKey, editGroupName[gKey])}
                          onKeyDown={(e) => e.key === 'Enter' && renameGroup(gKey, editGroupName[gKey] ?? gKey)}
                        />
                        <button className="btn-icon btn-icon-del" onClick={() => deleteGroup(gKey)} title="ลบกลุ่ม">🗑</button>
                      </>
                    )}
                  </div>
                  <div className="label-fund-list">
                    {groupFunds.length === 0 && <span className="dim">ยังไม่มีกอง</span>}
                    {groupFunds.map((f) => (
                      <div key={f.code} className="label-fund-row">
                        <span className="label-fund-code">{f.code}</span>
                        <select className="label-group-select"
                          value={f.group || ''}
                          onChange={(e) => onUpdateGroup(f.code, e.target.value)}>
                          <option value="">— ไม่มีกลุ่ม —</option>
                          {[...new Set([...allGroupNames, newGroup.trim()].filter(Boolean))].map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAG TAB ────────────────────────────────────────────────────── */}
        {tab === 'tag' && (
          <div className="label-content">
            <p className="search-hint" style={{ marginBottom: '0.75rem' }}>แท็กสร้างได้จาก card กองทุน — จัดการที่นี่ได้ (เปลี่ยนชื่อ / ลบ)</p>

            {allTagNames.length === 0 && <p className="search-hint">ยังไม่มีแท็ก</p>}

            {allTagNames.map((tag) => {
              const tagFunds = portfolioFunds.filter((f) => (f.tags ?? []).includes(tag));
              return (
                <div key={tag} className="label-group-section">
                  <div className="label-group-header">
                    <RenameTagInput tag={tag} onRename={(n) => renameTag(tag, n)} />
                    <button className="btn-icon btn-icon-del" onClick={() => deleteTag(tag)} title="ลบแท็ก">🗑</button>
                  </div>
                  <div className="label-fund-list">
                    {tagFunds.map((f) => (
                      <div key={f.code} className="label-fund-row">
                        <span className="label-fund-code">{f.code}</span>
                        <button className="tag-chip-del" style={{ fontSize: '0.85rem' }}
                          onClick={() => onUpdateTags(f.code, (f.tags ?? []).filter((t) => t !== tag))}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RenameTagInput({ tag, onRename }) {
  const [val, setVal] = useState(tag);
  return (
    <input className="label-group-name-input"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => val.trim() && val !== tag && onRename(val.trim())}
      onKeyDown={(e) => e.key === 'Enter' && val.trim() && onRename(val.trim())}
    />
  );
}
