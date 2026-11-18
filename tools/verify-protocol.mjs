import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadBars, buyFill, sellFill, value } from './model.mjs';

const bars = loadBars(process.argv[2]);
const reference = JSON.parse(readFileSync(new URL('../artifacts/initial/action-log.json', import.meta.url)));
const results = [];

async function execute(label, input, hello, expectedReplies) {
  const child = spawn(process.execPath, ['main.ts'], {
    cwd: new URL('..', import.meta.url), env: {}, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const reader = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${label}: ${code}: ${errors}`)));
  });
  const logs = [];
  let cash = 1_000_000_000n;
  let qty = 0n;
  let cost = 0n;
  let pending = [];
  let count = 0;
  let peak = Number(cash);
  let dd = 0;
  const account = price => ({ cash_quote_units: String(cash),
    equity_quote_units: String(cash + value(qty, price)),
    positions: qty ? [{ symbol: 'CBBTC', qty: String(qty), cost_quote_units: String(cost) }] : [] });
  child.stdin.write(JSON.stringify(hello) + '\n');
  for (let seq = 0; seq < input.length; seq++) {
    const bar = input[seq];
    const fills = [];
    for (const order of pending) {
      const before = qty;
      let fill;
      let amount;
      if (order.side === 'buy') {
        amount = BigInt(order.notional_quote_units);
        assert(amount >= 1_000_000n && amount <= cash);
        fill = buyFill(amount, bar.o, bar.o_depth);
        cash -= amount;
        qty += fill.qty;
        cost += amount;
        assert(fill.price * 10_000n <= BigInt(input[seq - 1].c) * BigInt(10_000 + order.max_slippage_bps));
      } else {
        amount = BigInt(order.qty);
        assert(amount > 0n && amount <= qty);
        fill = sellFill(amount, bar.o, bar.o_depth);
        cash += fill.proceeds;
        qty -= amount;
        cost -= cost * amount / before;
        assert(fill.price * 10_000n >= BigInt(input[seq - 1].c) * BigInt(10_000 - order.max_slippage_bps));
      }
      count++;
      fills.push({ ...order, status: 'filled', reason: null, decided_bar: input[seq - 1].t,
        fill_bar: bar.t, price: String(fill.price), qty: String(order.side === 'buy' ? fill.qty : amount),
        notional_quote_units: String(order.side === 'buy' ? amount : fill.proceeds + fill.fee),
        fee_quote_units: String(fill.fee) });
    }
    const equity = Number(cash + value(qty, bar.c));
    peak = Math.max(peak, equity);
    dd = Math.max(dd, 1 - equity / peak);
    child.stdin.write(JSON.stringify({ type: 'batch', seq, t: bar.t,
      bars: [{ ...bar, symbol: 'CBBTC' }], fills, account: account(bar.c) }) + '\n');
    const { value: line, done } = await reader.next();
    assert(!done, `${label}: missing reply ${seq}`);
    const reply = JSON.parse(line);
    assert.equal(reply.type, 'reply');
    assert.equal(reply.seq, seq);
    assert(reply.orders.length <= 16);
    if (expectedReplies) assert.deepEqual(reply, expectedReplies[seq]);
    logs.push(line);
    pending = reply.orders;
  }
  assert.equal(pending.length, 0, 'last batch must not submit orders');
  const final = input.at(-1);
  cash += sellFill(qty, final.c, final.c_depth).proceeds;
  qty = cost = 0n;
  dd = Math.max(dd, 1 - Number(cash) / peak);
  child.stdin.end(JSON.stringify({ type: 'done', seq: input.length,
    reason: 'end_of_data', account: account(final.c) }) + '\n');
  assert.equal((await reader.next()).done, true, 'extra reply after done');
  await exited;
  assert.equal(errors, '');
  const bytes = logs.join('\n') + '\n';
  writeFileSync(new URL(`../artifacts/${label}.ndjson`, import.meta.url), bytes);
  const result = { label, pnl: Number(cash - 1_000_000_000n) / 1e6, trades: count, dd,
    sha256: createHash('sha256').update(bytes).digest('hex') };
  results.push(result);
  return result;
}

const first = await execute('protocol-dev-a', bars, reference.hello, reference.replies);
const second = await execute('protocol-dev-b', bars, reference.hello, reference.replies);
assert.equal(first.sha256, second.sha256);
assert.equal(first.pnl, JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url))).predictedPnl);
const shifted = bars.map(bar => ({ ...bar, t: bar.t + 7 * 86_400_000 }));
const hello = { ...reference.hello, first_close_ms: shifted[0].t };
const raceA = await execute('protocol-race-a', shifted, hello);
const raceB = await execute('protocol-race-b', shifted, hello);
assert.equal(raceA.sha256, raceB.sha256);
assert(raceA.pnl > 0);
const flat = shifted.map(bar => ({ ...bar, o: bars[0].c, h: bars[0].c, l: bars[0].c, c: bars[0].c }));
const participation = await execute('protocol-flat', flat, hello);
assert.equal(participation.trades, 2);
assert(participation.pnl > -0.02);
writeFileSync(new URL('../artifacts/protocol-verification.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
