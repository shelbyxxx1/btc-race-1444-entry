import { loadBars } from './model.mjs';

const bars = loadBars(process.argv[2]);
const closes = bars.map(bar => Number(bar.c));
const returns = closes.slice(1).map((close, index) => (close / closes[index] - 1) * 1e4);
const quantiles = values => {
  const sorted = [...values].sort((left, right) => left - right);
  return Object.fromEntries([0.25, 0.5, 0.75, 0.95].map(level =>
    [String(level), sorted[Math.floor(sorted.length * level)]]));
};
const stdev = values => {
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  return Math.sqrt(values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / values.length);
};
let peak = closes[0];
let maxDrawdown = 0;
for (const close of closes) {
  peak = Math.max(peak, close);
  maxDrawdown = Math.max(maxDrawdown, 1 - close / peak);
}
console.log(JSON.stringify({
  bars: bars.length,
  start: bars[0].t - 60_000,
  end: bars.at(-1).t,
  returnBps: (closes.at(-1) / closes[0] - 1) * 1e4,
  maxDrawdown,
  absoluteMinuteReturnBps: quantiles(returns.map(Math.abs)),
  hourlyMinuteVolatilityBps: Array.from({ length: 24 }, (_, hour) => stdev(returns.slice(hour * 60, (hour + 1) * 60))),
  dipBps: Object.fromEntries([20, 40, 65].map(length => [length,
    quantiles(bars.slice(length).map((bar, offset) =>
      (1 - Number(bar.c) / Math.max(...bars.slice(offset, offset + length).map(item => Number(item.h)))) * 1e4))])),
  bounceFiveMinuteBps: quantiles(bars.slice(4).map((bar, offset) =>
    (Number(bar.c) / Math.min(...bars.slice(offset, offset + 5).map(item => Number(item.l))) - 1) * 1e4)),
  depthUsdc: quantiles(bars.map(bar => Number(bar.c_depth[0]) / 1e6)),
}, null, 2));
