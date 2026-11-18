import type { Bar } from './vendor/makefun-bars.ts';

export const parameters = {
  lookback: 65, dip: 85, bounce: 40, reboundBars: 5,
  takeProfit: 60, trailArm: 55, trail: 30, stop: 95,
  hold: 120, cooldown: 45, meanFloor: 30,
};

export function createStrategy(config = parameters) {
  const minute = 60_000;
  const tape: { t: number; close: number; high: number; low: number }[] = [];
  let opened = -Infinity;
  let exited = -Infinity;
  let peak = 0;
  let pendingEntry = false;
  let hadPosition = false;
  return (bar: Bar, position: { qty: bigint; cost: bigint } | undefined) => {
    const { t } = bar;
    const close = Number(bar.c);
    const previous = tape.at(-1)?.close ?? close;
    if (position && pendingEntry) {
      opened = t;
      peak = close;
    }
    if (!position && hadPosition) exited = t;
    pendingEntry = false;
    hadPosition = !!position;
    tape.push({ t, close, high: Number(bar.h), low: Number(bar.l) });
    while (t - tape[0].t >= config.lookback * minute) tape.shift();
    const recent = tape.filter(point => t - point.t < config.reboundBars * minute);
    const mean = tape.reduce((sum, point) => sum + point.close, 0) / tape.length;
    if (position) {
      const basis = Number(position.cost) / Number(position.qty) * 1e7;
      peak = Math.max(peak, close);
      const gain = (close / basis - 1) * 1e4;
      const best = (peak / basis - 1) * 1e4;
      const pullback = (1 - close / peak) * 1e4;
      if (gain <= -config.stop || gain >= config.takeProfit ||
          (gain >= config.meanFloor && close >= mean) ||
          (best >= config.trailArm && pullback >= config.trail) ||
          t - opened >= config.hold * minute) return 'sell';
      return;
    }
    if (tape.length < Math.ceil(config.lookback * 0.85) || t - exited < config.cooldown * minute) return;
    const high = Math.max(...tape.map(point => point.high));
    const low = Math.min(...recent.map(point => point.low));
    const dip = (1 - close / high) * 1e4;
    const bounce = (close / low - 1) * 1e4;
    if (dip >= config.dip && bounce >= config.bounce && close >= previous) {
      pendingEntry = true;
      return 'buy';
    }
  };
}
