export type RoundId = "main" | "hourly";

export type RoundState = {
  id: RoundId;
  durationSec: number;

  startedAtMs: number;
  endsAtMs: number;

  startBlock: bigint;
  lastScannedBlock: bigint;

  buys: number;
  lastBuyer: string | null;

  payoutMetricUsd: number; // from Clanker estimate
};

export type WinnerRecord = {
  roundId: RoundId;
  wallet: string;
  wonAtMs: number;
  payoutMetricUsd: number;
  txHash?: string;
};

export type LogItem = {
  kind: "TRADE" | "WIN" | "PAYOUT" | "CLAIM" | "INFO";
  message: string;
  atMs: number;
  txHash?: string;
};

export type SwapItem = {
  atMs: number;
  roundId: RoundId;
  buyer: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
};
