import {
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
const fmt = (v) => (v == null ? 'N/A' : Number(v).toFixed(4));
const fmtDate = (d) => (d ? d.slice(5) : '');

function NavTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <p className="tooltip-date">{label}</p>
      <p style={{ color: '#60a5fa' }}>NAV: {fmt(payload[0]?.value)}</p>
    </div>
  );
}

function MacdTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const map = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]));
  return (
    <div className="tooltip">
      <p className="tooltip-date">{label}</p>
      <p style={{ color: '#f59e0b' }}>MACD: {fmt(map.macd)}</p>
      <p style={{ color: '#ef4444' }}>Signal: {fmt(map.signal)}</p>
      <p style={{ color: map.histogram >= 0 ? '#34d399' : '#f87171' }}>
        Histogram: {fmt(map.histogram)}
      </p>
    </div>
  );
}

export default function FundChart({ code, name, data }) {
  const fund = { name };
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);
  const displayData = data.filter((r) => r.date >= cutoff);

  const lastRow = displayData[displayData.length - 1] ?? {};
  const crossover =
    displayData.length >= 2
      ? (() => {
          const prev = displayData[displayData.length - 2];
          const curr = displayData[displayData.length - 1];
          if (!prev?.signal || !curr?.signal) return null;
          if (prev.macd < prev.signal && curr.macd >= curr.signal && curr.macd < 0)
            return 'bullish_below_zero';
          return null;
        })()
      : null;

  return (
    <div className="fund-card">
      <div className="fund-card-header">
        <div>
          <h3>{code}</h3>
          <span className="fund-name">{fund?.name}</span>
        </div>
        <div className="fund-stats">
          <span className="nav-value">NAV {fmt(lastRow.nav)}</span>
          {lastRow.date && <span className="nav-date">{lastRow.date}</span>}
          {crossover === 'bullish_below_zero' && (
            <span className="badge badge-bull">🚀 Fast ตัด Slow ขึ้น (MACD &lt; 0)</span>
          )}
        </div>
      </div>

      {/* NAV Chart */}
      <p className="chart-label">NAV</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={displayData} syncId={code} margin={{ left: 10, right: 10, top: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fontSize: 10 }}
            width={55}
          />
          <Tooltip content={<NavTooltip />} />
          <Line
            type="monotone"
            dataKey="nav"
            stroke="#60a5fa"
            dot={false}
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* MACD Chart */}
      <p className="chart-label">MACD (12, 26, 9)</p>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={displayData} syncId={code} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={(v) => v.toFixed(3)} tick={{ fontSize: 10 }} width={55} />
          <Tooltip content={<MacdTooltip />} />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
          <Bar dataKey="histogram" name="Histogram">
            {displayData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.histogram >= 0 ? '#34d399' : '#f87171'}
                fillOpacity={0.7}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="macd"
            stroke="#f59e0b"
            dot={false}
            strokeWidth={1.5}
          />
          <Line
            type="monotone"
            dataKey="signal"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <Legend
            formatter={(v) => ({ macd: 'MACD', signal: 'Signal', histogram: 'Histogram' }[v] ?? v)}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
