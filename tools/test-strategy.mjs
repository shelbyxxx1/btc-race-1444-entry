import { writeFileSync } from 'node:fs';
import { createStrategy, parameters } from '../strategy.ts';
import { loadBars, buyFill, sellFill, value } from './model.mjs';

const bars = loadBars(process.argv[2]);

export function simulate(config, input = bars) {
  const decide = createStrategy(config);
  let cash = 1_000_000_000n;
  let qty = 0n;
  let cost = 0n;
  let pending;
  let peak = Number(cash);
  let dd = 0;
  let trades = 0;
  for (let index = 0; index < input.length; index++) {
    const bar = input[index];
    if (pending === 'buy') {
      const amount = cash * 96n / 100n;
      qty = buyFill(amount, bar.o, bar.o_depth).qty;
      cost = amount;
      cash -= amount;
      trades++;
    } else if (pending === 'sell') {
      cash += sellFill(qty, bar.o, bar.o_depth).proceeds;
      qty = cost = 0n;
      trades++;
    }
    const equity = Number(cash + value(qty, bar.c));
    peak = Math.max(peak, equity);
    dd = Math.max(dd, 1 - equity / peak);
    pending = index === input.length - 1 ? undefined : decide(bar, qty ? { qty, cost } : undefined);
  }
  cash += sellFill(qty, input.at(-1).c, input.at(-1).c_depth).proceeds;
  dd = Math.max(dd, 1 - Number(cash) / peak);
  return { pnl: Number(cash - 1_000_000_000n) / 1e6, trades, dd };
}

function sensitivity(config) {
  const cases = [{ parameter: 'base', factor: 1, ...simulate(config) }];
  for (const parameter of Object.keys(config)) {
    for (const factor of [0.8, 1.2]) {
      cases.push({ parameter, factor, ...simulate({ ...config, [parameter]: config[parameter] * factor }) });
    }
  }
  return cases;
}

if (process.argv.includes('--search')) {
  const candidates = [];
  let seed = 1444;
  const choose = values => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[seed % values.length];
  };
  for (let attempt = 0; attempt < 3200; attempt++) {
    const config = {
      lookback: choose([25, 35, 45, 55, 65, 80, 100, 130]),
      dip: choose([40, 55, 70, 85, 100, 120, 145, 170]),
      bounce: choose([5, 8, 12, 16, 20, 25, 32, 40, 50]),
      reboundBars: choose([3, 5, 7, 10]),
      takeProfit: choose([30, 45, 60, 75, 95, 120]),
      trailArm: choose([25, 40, 55, 75, 100]),
      trail: choose([10, 15, 20, 30, 40]),
      stop: choose([35, 50, 70, 95, 120, 160]),
      hold: choose([30, 45, 60, 90, 120, 180]),
      cooldown: choose([10, 20, 30, 45, 60]),
      meanFloor: choose([20, 30, 40, 55, 75]),
    };
    const result = simulate(config);
    if (result.pnl > 2 && result.trades >= 4) candidates.push({ config, ...result });
  }
  candidates.sort((left, right) => right.pnl - left.pnl);
  const robust = candidates.slice(0, 120).map(candidate => {
    const cases = sensitivity(candidate.config);
    return { ...candidate, worst: Math.min(...cases.map(test => test.pnl)), cases };
  }).sort((left, right) => right.worst - left.worst);
  console.log(JSON.stringify(robust.slice(0, 3), null, 2));
} else {
  const cases = sensitivity(parameters);
  console.log(JSON.stringify(cases, null, 2));
  writeFileSync(new URL('../artifacts/sensitivity.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
  if (cases.some(test => test.pnl <= 0)) process.exitCode = 1;
}
