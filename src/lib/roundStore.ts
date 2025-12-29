import type { Address } from "viem";
import { getEstimatedRewardsUsdByPool } from "@/lib/clanker";
import { detectPoolType } from "@/lib/detectPoolType";
import { getCurrentBlockNumber, scanSwaps, maskWallet } from "@/lib/onchain";
import type { LogItem, RoundId, RoundState, SwapItem, WinnerRecord } from "@/lib/types";

const MAIN_DURATION = 60;
const HOURLY_DURATION = 60 * 60;

function nowMs() {
  return Date.now();
}

function nextEndsAt(startMs: number, durationSec: number) {
  return startMs + durationSec * 1000;
}

type Store = {
  initialized: boolean;
  poolAddress: Address;
  poolType: "v2" | "v3";
  rounds: Record<RoundId, RoundState>;
  winners: WinnerRecord[];
  logs: LogItem[];
  swaps: SwapItem[]; // latest swaps across rounds
};

const store: Store = {
  initialized: false,
  poolAddress: "0x0000000000000000000000000000000000000000",
  poolType: "v3",
  rounds: {} as any,
  winners: [],
  logs: [],
  swaps: [],
};

function pushLog(item: LogItem) {
  store.logs.unshift(item);
  store.logs = store.logs.slice(0, 80);
}

function pushWinner(w: WinnerRecord) {
  store.winners.unshift(w);
  store.winners = store.winners.slice(0, 30);
}

function pushSwaps(items: SwapItem[]) {
  // Dedup by txHash + roundId (good enough)
  const key = (s: SwapItem) => `${s.roundId}:${s.txHash}`;
  const seen = new Set(store.swaps.map(key));

  for (const s of items) {
    const k = key(s);
    if (!seen.has(k)) {
      store.swaps.unshift(s);
      seen.add(k);
    }
  }
  store.swaps = store.swaps.slice(0, 20);
}

function makeRound(id: RoundId, durationSec: number, startMs: number, startBlock: bigint): RoundState {
  return {
    id,
    durationSec,
    startedAtMs: startMs,
    endsAtMs: nextEndsAt(startMs, durationSec),
    startBlock,
    lastScannedBlock: startBlock,
    buys: 0,
    lastBuyer: null,
    payoutMetricUsd: 0,
  };
}

export async function ensureInitialized() {
  if (store.initialized) return;

  const pool = process.env.POOL_ADDRESS?.trim();
  if (!pool || !/^0x[a-fA-F0-9]{40}$/.test(pool)) {
    throw new Error("Invalid or missing POOL_ADDRESS");
  }

  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) throw new Error("Missing BASE_RPC_URL");

  store.poolAddress = pool as Address;
  store.poolType = await detectPoolType({ rpcUrl, poolAddress: store.poolAddress });

  const block = await getCurrentBlockNumber(rpcUrl);
  const startMs = nowMs();

  store.rounds.main = makeRound("main", MAIN_DURATION, startMs, block);
  store.rounds.hourly = makeRound("hourly", HOURLY_DURATION, startMs, block);

  pushLog({
    kind: "INFO",
    message: `Initialized. Pool ${maskWallet(pool)} (${store.poolType.toUpperCase()})`,
    atMs: startMs,
  });

  store.initialized = true;
}

async function refreshPayoutMetric(poolAddress: string) {
  const usd = await getEstimatedRewardsUsdByPool(poolAddress);
  store.rounds.main.payoutMetricUsd = usd;
  store.rounds.hourly.payoutMetricUsd = usd;
}

function roundEnded(r: RoundState) {
  return nowMs() >= r.endsAtMs;
}

function resetRound(r: RoundState, newStartBlock: bigint) {
  const startMs = nowMs();
  store.rounds[r.id] = makeRound(r.id, r.durationSec, startMs, newStartBlock);
  pushLog({ kind: "INFO", message: `${r.id.toUpperCase()} round reset`, atMs: startMs });
}

export async function closeRound(id: RoundId) {
  const rpcUrl = process.env.BASE_RPC_URL!;
  const r = store.rounds[id];
  const currentBlock = await getCurrentBlockNumber(rpcUrl);

  const swaps = await scanSwaps({
    rpcUrl,
    poolAddress: store.poolAddress,
    poolType: store.poolType,
    fromBlock: r.startBlock,
    toBlock: currentBlock,
  });

  if (!swaps.length) {
    pushLog({ kind: "WIN", message: `${id.toUpperCase()} ended: no swaps`, atMs: nowMs() });
    return;
  }

  const last = swaps[swaps.length - 1];
  const winner = last.buyer;

  pushWinner({
    roundId: id,
    wallet: winner,
    wonAtMs: nowMs(),
    payoutMetricUsd: r.payoutMetricUsd,
    txHash: last.txHash,
  });

  pushLog({
    kind: "WIN",
    message: `${id.toUpperCase()} winner: ${maskWallet(winner)} | metric ${r.payoutMetricUsd.toFixed(4)} USD`,
    atMs: nowMs(),
    txHash: last.txHash,
  });
}

export async function syncRounds() {
  await ensureInitialized();

  const rpcUrl = process.env.BASE_RPC_URL!;
  const currentBlock = await getCurrentBlockNumber(rpcUrl);

  await refreshPayoutMetric(store.poolAddress);

  for (const id of ["main", "hourly"] as RoundId[]) {
    const r = store.rounds[id];

    if (roundEnded(r)) {
      await closeRound(id);
      resetRound(r, currentBlock);
      continue;
    }

    const fromBlock = r.lastScannedBlock + 1n;
    const toBlock = currentBlock;
    if (toBlock < fromBlock) continue;

    // Chunked scan to avoid RPC log limits
    let scanFrom = fromBlock;
    const CHUNK = 1200n;

    while (scanFrom <= toBlock) {
      const scanTo = scanFrom + CHUNK > toBlock ? toBlock : scanFrom + CHUNK;

      const swaps = await scanSwaps({
        rpcUrl,
        poolAddress: store.poolAddress,
        poolType: store.poolType,
        fromBlock: scanFrom,
        toBlock: scanTo,
      });

      if (swaps.length) {
        r.buys += swaps.length;
        r.lastBuyer = swaps[swaps.length - 1].buyer;

        pushSwaps(
          swaps.slice(-20).reverse().map((s) => ({
            atMs: nowMs(),
            roundId: id,
            buyer: s.buyer,
            txHash: s.txHash,
            blockNumber: s.blockNumber,
          }))
        );

        pushLog({
          kind: "TRADE",
          message: `${id.toUpperCase()} swap(s): +${swaps.length} | last buyer ${maskWallet(r.lastBuyer)}`,
          atMs: nowMs(),
          txHash: swaps[swaps.length - 1].txHash,
        });
      }

      r.lastScannedBlock = scanTo;
      scanFrom = scanTo + 1n;
    }
  }
}

export function getSnapshot() {
  return {
    poolAddress: store.poolAddress,
    poolType: store.poolType,
    nowMs: nowMs(),
    rounds: store.rounds,
    winners: store.winners,
    logs: store.logs,
    swaps: store.swaps,
  };
}
