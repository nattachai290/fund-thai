function calculateEMA(values, period) {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const result = new Array(period - 1).fill(null);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calculateMACD(prices, short = 12, long = 26, signal = 9) {
  const ema12 = calculateEMA(prices, short);
  const ema26 = calculateEMA(prices, long);

  const macdLine = ema12.map((v12, i) =>
    v12 !== null && ema26[i] !== null ? v12 - ema26[i] : null
  );

  const validMacd = macdLine.filter((v) => v !== null);
  const signalEMA = calculateEMA(validMacd, signal);

  let idx = 0;
  return macdLine.map((macd) => {
    if (macd === null) return { macd: null, signal: null, histogram: null };
    const sig = signalEMA[idx] !== undefined ? signalEMA[idx] : null;
    const histogram = sig !== null ? macd - sig : null;
    idx++;
    return { macd, signal: sig, histogram };
  });
}

export function detectCrossover(macdData) {
  if (macdData.length < 2) return null;
  const prev = macdData[macdData.length - 2];
  const curr = macdData[macdData.length - 1];
  if (!prev.signal || !curr.signal) return null;
  if (prev.macd < prev.signal && curr.macd >= curr.signal) return 'bullish';
  if (prev.macd > prev.signal && curr.macd <= curr.signal) return 'bearish';
  return null;
}
