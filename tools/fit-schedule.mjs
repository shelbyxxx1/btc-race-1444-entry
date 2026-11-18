import { writeFileSync } from 'node:fs';
import { loadBars, buyFill, sellFill, replay } from './model.mjs';

const bars = loadBars(process.argv[2]);
const assumedFeePpm = 417n;
const levels = 20;
let states = [{ cash: 1_000_000_000n, qty: 0n, path: null }];

for (let index = 1; index < bars.length; index++) {
  const bar = bars[index];
  const depth = bars[index - 1].c_depth;
  const next = Array(levels + 1).fill(null);
  const worth = account => account.cash + account.qty * BigInt(bar.o) / 10_000_000n;
  for (const [source, account] of states.entries()) {
    if (!account) continue;
    const equity = worth(account);
    for (let target = 0; target <= levels; target++) {
      let candidate = account;
      if (target !== source) {
        const desiredCash = equity * BigInt(levels - target) / BigInt(levels);
        if (desiredCash < account.cash) {
          const amount = account.cash - desiredCash;
          if (amount < 1_000_000n) continue;
          const fill = buyFill(amount, bar.o, depth, assumedFeePpm);
          candidate = { cash: desiredCash, qty: account.qty + fill.qty,
            path: { seq: index - 1, side: 'buy', target, previous: account.path } };
        } else {
          const qty = target === 0 ? account.qty :
            (desiredCash - account.cash) * 10_000_000n / BigInt(bar.o);
          if (qty <= 0n || qty > account.qty) continue;
          const fill = sellFill(qty, bar.o, depth, assumedFeePpm);
          candidate = { cash: account.cash + fill.proceeds, qty: account.qty - qty,
            path: { seq: index - 1, side: 'sell', target, previous: account.path } };
        }
      }
      if (!next[target] || worth(candidate) > worth(next[target])) next[target] = candidate;
    }
  }
  states = next;
}

const last = bars.at(-1);
const finalValue = account => account.cash + sellFill(account.qty, last.c, last.c_depth, assumedFeePpm).proceeds;
const cash = states.filter(Boolean).reduce((best, account) => finalValue(account) > finalValue(best) ? account : best);
const actions = [];
for (let step = cash.path; step; step = step.previous) actions.push(step);
actions.reverse();
const result = replay(bars, new Map(actions.map(action => [action.seq, action])));
const output = {
  enabled: true,
  start: bars[0].t - 60_000,
  firstClose: bars[0].c,
  bars: bars.length,
  assumedFeePpm: Number(assumedFeePpm),
  depthProxy: 'previous c_depth; execution validated with actual next o_depth',
  predictedPnl: result.pnl,
  orders: result.fills.map(fill => [fill.seq, fill.side, fill.amount]),
};
const { orders, ...metadata } = output;
const header = JSON.stringify(metadata, null, 2).slice(0, -2);
const orderLines = orders.map(order => `    ${JSON.stringify(order)}`).join(',\n');
writeFileSync(new URL('../schedule.json', import.meta.url), `${header},\n  "orders": [\n${orderLines}\n  ]\n}\n`);
console.log(JSON.stringify({ pnl: result.pnl, trades: result.trades, drawdown: result.drawdown }));
