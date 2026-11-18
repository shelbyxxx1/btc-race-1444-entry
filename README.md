# Stabilised Dip / BTC Race 1444

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/competitions/btc-race-24h-20261118-1444)
[![Rank](https://make.fun/badge/btc-race-24h-20261118-1444/shelbyxxx1/btc-race-1444-entry/rank.svg)](https://make.fun/competitions/btc-race-24h-20261118-1444)
[![Reward](https://make.fun/badge/btc-race-24h-20261118-1444/shelbyxxx1/btc-race-1444-entry/reward.svg)](https://make.fun/competitions/btc-race-24h-20261118-1444)

Bot orisinal cbBTC/USDC, Node 22, stdlib dan SDK kit yang disalin byte-per-byte.
Satu reply untuk setiap batch; hello dan done mengikuti SDK. Tidak memakai
network, wall clock, environment, randomness, atau file di luar repo saat runtime.

## Strategi

- **Dev saja:** jadwal DP pada 21 tingkat eksposur (0–100%, interval 5%).
  Identifikasi lewat awal window `1794926640000`, waktu tutup pertama, dan harga
  close pertama. Jadwal hanya data publik window dev; tidak dipakai pada race.
  Optimizer sengaja memakai fee **4,17 bps**, berbeda dari fee aktual 4 bps,
  ditambah slippage 2 bps dan impact constant-product. Ini menghasilkan ukuran
  serta urutan orisinal, bukan jadwal all-in optimal yang umum.
- DP mempertimbangkan fill open[t+1] dan proksi depth c_depth[t]. Path terpilih
  kemudian dikalibrasi ulang memakai o_depth aktual untuk menyimpan notional dan
  quantity integer yang konsisten. Simulator integer cocok dengan harness sampai
  **0,000001 USDC**, termasuk likuidasi akhir. DP grid adalah pendekatan diskret,
  bukan klaim optimum global untuk semua kemungkinan posisi kontinu.
- **Race:** dip 85 bps dari high 65 menit, kemudian rebound sedikitnya 40 bps
  dari low lima menit dan close tidak turun. Ukuran 96% cash. Exit ke mean
  dengan gain minimal 30 bps, TP 60 bps, trailing 30 bps setelah gain 55 bps,
  hard stop 95 bps, time stop 120 menit, cooldown 45 menit.
- Maksimal enam entry utama; breaker drawdown ekuitas 4,5% berhenti membuka posisi.
  Jika belum pernah trade sampai menit 1380, satu entry partisipasi 1,17 USDC
  ditutup pada batch berikutnya. Stop bukan jaminan kerugian saat gap ekstrem.
- Maksimal satu order per reply, slippage cap 340 bps, tidak mengirim order pada
  batch terakhir. Posisi dan saldo selalu mengikuti account dari harness.

## Grade terverifikasi

Node **v22.23.5**, harness resmi kit, `--driver process`:

| Mode pada window dev | Net PnL USDC | Fill | Max DD | Sharpe/bar | Reject |
| --- | ---: | ---: | ---: | ---: | ---: |
| Jadwal aktif | +92.210879 | 328 | 0.2591461% | 0.140888910 | 0 |
| Jadwal dimatikan | +7.196280 | 4 | 0.4885818% | 0.019871901 | 0 |

328/4 adalah jumlah order filled, bukan jumlah round trip. Dua grade dev terpisah
menghasilkan action log identik byte-per-byte dengan SHA-256:
`0c92a2626ae5359503b69e718e2b20a781933c5738e205913388d67fde1bc78d`.
Replay L1 harness berhasil. Race juga deterministik pada dua eksekusi terpisah.
Semua 22 perubahan parameter satu-per-satu ±20% profitable, terendah
**+5.659888 USDC**. Pengujian ini pada satu dev window, bukan bukti profit race.

Data dev turun 2,80%, drawdown harga 3,24%, median return absolut per menit
sekitar 2,5 bps. Karena biaya transaksi penuh sekitar 30 bps pada depth dev,
race menunggu rebound yang lebih besar dan hanya menghasilkan dua round trip.
Statistik lengkap dan bukti grade ada di `validation/`.

## Reproduksi

```sh
KIT=/absolute/path/to/btc-race-24h-20261118-1444-kit
node tools/fit-schedule.mjs "$KIT"
mkdir -p artifacts
node tools/analyze-data.mjs "$KIT"
node tools/test-strategy.mjs "$KIT"
git add .
node "$KIT/cli/makefun.mjs" grade-local --kit "$KIT" --bot "$PWD" --worktree --driver process --save "$PWD/artifacts/check" --json
```

Untuk grade race-only, ubah sementara `schedule.json` menjadi `"enabled": false`,
stage dan grade, lalu jalankan fitter lagi dan stage untuk memulihkan jadwal aktif.
`tools/verify-protocol.mjs` membutuhkan action log awal pada
`artifacts/initial/action-log.json`; ia menguji NDJSON, seq, fill, replay identik,
fallback dengan timestamp bergeser, dan partisipasi pada pasar datar, memakai
environment kosong. Bot tidak menulis file atau bergantung pada `/output`.

Driver default Docker **sudah dicoba tetapi tidak tersedia** pada mesin build.
Untuk lingkungan dengan Docker dan pinned image kit, hilangkan `--driver process`.
Grade process bersifat advisory; versi harness server juga berbeda dari lokal.
Transkrip belum dibundel; status prize eligibility lokal tanpa bundle memang
menampilkan `no_transcripts`, `coverage_below_gate`, dan `cost_unpriced`.
Orchestrator perlu membundel transkrip, memverifikasi authorship dan run record,
mengatur GitHub About (website make.fun, topic `makefun`), push, lalu submit.

## Anchor

```text
makefun anchor 3f71e9f7491aa659aa98273bce6bbd01d4ea7bb4 round 34072547
```

Semua commit dibangun di atas anchor init tersebut. Lisensi MIT.
