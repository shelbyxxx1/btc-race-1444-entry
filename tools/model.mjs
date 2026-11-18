import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export function loadBars(kit) {
  return gunzipSync(readFileSync(`${kit}/dataset/bars/CBBTC.ndjson.gz`))
    .toString().trim().split('\n').map(JSON.parse);
}

export const value = (qty, price) => qty * BigInt(price) / 10_000_000n;

function impact(amount, depth) {
  const values = depth.map(BigInt);
  const product = values.reduce((result, item) => result * item, 1n);
  const sum = values.reduce((result, _, index) => result +
    values.reduce((part, item, other) => other === index ? part : part * item, 1n), 0n);
  return { num: product + amount * sum, den: product };
}

export function buyFill(amount, open, depth, feePpm = 400n) {
  const spend = amount * (1_000_000n - feePpm) / 1_000_000n;
  const factor = impact(spend, depth);
  const price = BigInt(open) * 10_002n * factor.num / (10_000n * factor.den);
  return { qty: spend * 10_000_000n / price, price, fee: amount - spend };
}

export function sellFill(qty, open, depth, feePpm = 400n) {
  const factor = impact(value(qty, open), depth);
  const slipped = BigInt(open) * 9_998n * factor.den / (10_000n * factor.num);
  const price = slipped > 0n ? slipped : 1n;
  const gross = value(qty, price);
  const proceeds = gross * (1_000_000n - feePpm) / 1_000_000n;
  return { proceeds, price, fee: gross - proceeds };
}

export function replay(bars, actions) {
  let cash = 1_000_000_000n;
  let qty = 0n;
  let peak = cash;
  let drawdown = 0;
  const fills = [];
  const equity = [];
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index];
    const action = actions.get(index - 1);
    const equityAtOpen = cash + value(qty, bar.o);
    const desiredCash = action?.target === undefined ? null :
      equityAtOpen * BigInt(20 - action.target) / 20n;
    if (action?.side === 'buy') {
      const amount = action.amount === undefined ?
        (desiredCash === null ? cash : cash - desiredCash) : BigInt(action.amount);
      const fill = buyFill(amount, bar.o, bar.o_depth);
      cash -= amount;
      qty += fill.qty;
      fills.push({ seq: index - 1, side: 'buy', amount: Number(amount), ...fill });
    } else if (action?.side === 'sell') {
      const amount = action.amount === undefined ?
        (desiredCash === null || action.target === 0 ? qty :
          (desiredCash - cash) * 10_000_000n / BigInt(bar.o)) : BigInt(action.amount);
      const fill = sellFill(amount, bar.o, bar.o_depth);
      cash += fill.proceeds;
      qty -= amount;
      fills.push({ seq: index - 1, side: 'sell', amount: Number(amount), ...fill });
    }
    const mark = cash + value(qty, bar.c);
    peak = mark > peak ? mark : peak;
    drawdown = Math.max(drawdown, Number(peak - mark) / Number(peak));
    equity.push(Number(mark));
  }
  const last = bars.at(-1);
  cash += sellFill(qty, last.c, last.c_depth).proceeds;
  drawdown = Math.max(drawdown, Number(peak - cash) / Number(peak));
  return { cash, pnl: Number(cash - 1_000_000_000n) / 1e6, drawdown, trades: fills.length, fills, equity };
}
