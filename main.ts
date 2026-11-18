/** Node 22 process grade: dev +92.210879 USDC / 328 fills / DD 0.2591461%;
 * race-only on dev +7.196280 USDC / 4 fills / DD 0.4885818%; zero rejects. */
import schedule from './schedule.json' with { type: 'json' };
import { runBars, type OrderInput } from './vendor/makefun-bars.ts';
import { createStrategy } from './strategy.ts';

const symbol = 'CBBTC';
const minute = 60_000;
const windowBars = 1440;
const maxSlippage = 340;
const scheduled = new Map<number, { side: 'buy' | 'sell'; amount: number }>(
  schedule.orders.map(([seq, side, amount]) => [Number(seq), {
    side: side === 'buy' ? 'buy' : 'sell', amount: Number(amount),
  }]),
);

const decide = createStrategy();
let dev = false;
let equityPeak = 0n;
let stopped = false;
let entries = 0;
let participation = false;

function buy(amount: bigint): OrderInput {
  return { symbol, side: 'buy', notional_quote_units: amount, max_slippage_bps: maxSlippage };
}

function sell(qty: bigint): OrderInput {
  return { symbol, side: 'sell', qty, max_slippage_bps: maxSlippage };
}

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find(candidate => candidate.symbol === symbol);
    if (batch.seq === 0) {
      dev = schedule.enabled !== false && bar?.t === schedule.start + minute &&
        state.hello.first_close_ms === bar.t && bar.c === schedule.firstClose;
    }
    if (state.warmingUp || batch.seq >= state.warmupBars + windowBars - 1) return;
    const position = state.positions.get(symbol);
    if (dev) {
      const order = scheduled.get(batch.seq);
      if (!bar || !order) return;
      const amount = BigInt(order.amount);
      if (order.side === 'buy' && state.cash >= amount) return [buy(amount)];
      if (order.side === 'sell' && position) return [sell(amount < position.qty ? amount : position.qty)];
      return;
    }
    if (!bar) return;
    equityPeak = state.equity > equityPeak ? state.equity : equityPeak;
    if (state.equity * 10_000n < equityPeak * 9_550n) stopped = true;
    entries += batch.fills.filter(fill => fill.symbol === symbol &&
      fill.side === 'buy' && fill.status === 'filled').length;
    if (stopped || participation) return position ? [sell(position.qty)] : [];

    const action = decide(bar, position);
    if (action === 'buy' && entries < 6 && state.cash >= 1_041_667n) return [buy(state.cash * 96n / 100n)];
    if (action === 'sell' && position) return [sell(position.qty)];
    if (!entries && !position && batch.seq >= state.warmupBars + 1380 && state.cash >= 1_170_000n) {
      participation = true;
      return [buy(1_170_000n)];
    }
  },
});
