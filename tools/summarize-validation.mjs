import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

mkdirSync(new URL('../validation/', import.meta.url), { recursive: true });
const read = name => JSON.parse(readFileSync(new URL(`../artifacts/${name}`, import.meta.url)));
const devA = read('final-a-grade.json');
const devB = read('final-b-grade.json');
const race = read('race-final-grade.json');
assert.equal(devA.action_log_sha256, devB.action_log_sha256);
assert.equal(JSON.parse(readFileSync(new URL('../schedule.json', import.meta.url))).enabled, true);
for (const result of [devA, devB, race]) {
  assert.equal(result.status, 'finished');
  assert.equal(result.error, null);
  assert.equal(result.result.performance.metrics.rejected, 0);
  assert.equal(result.l1.reproduced, true);
  assert(BigInt(result.result.performance.metrics.net_pnl_quote_units) > 0n);
}
const sensitivity = read('sensitivity.json');
assert.equal(sensitivity.length, 23);
assert(sensitivity.every(test => test.pnl > 0));
const summarize = result => ({
  status: result.status,
  driver: result.driver,
  harness: result.result.harness,
  action_log_sha256: result.action_log_sha256,
  metrics: result.result.performance.metrics,
  l1: result.l1,
  mismatches: result.mismatches,
  notes: result.notes,
});
const report = {
  anchor: 'makefun anchor 3f71e9f7491aa659aa98273bce6bbd01d4ea7bb4 round 34072547',
  dev: summarize(devB), raceOnly: summarize(race),
  deterministic: true,
  devLogSecondRun: devA.action_log_sha256,
  sensitivityWorstPnl: Math.min(...sensitivity.map(test => test.pnl)),
  protocol: read('protocol-verification.json'),
  limitations: ['Docker unavailable; process driver is advisory and unisolated.',
    'Submission eligibility requires orchestrator transcript bundle and server checks.',
    'Sensitivity uses the same published dev window; it is not out-of-sample evidence.'],
};
writeFileSync(new URL('../validation/report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
writeFileSync(new URL('../validation/sensitivity.json', import.meta.url), JSON.stringify(sensitivity, null, 2) + '\n');
console.log(JSON.stringify({ dev: report.dev.metrics.net_pnl_quote_units,
  race: report.raceOnly.metrics.net_pnl_quote_units, worst: report.sensitivityWorstPnl }));
