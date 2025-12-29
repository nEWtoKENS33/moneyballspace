"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./Console.module.css";

type Snapshot = {
  poolAddress: string;
  poolType: "v2" | "v3";
  nowMs: number;
  rounds: { main: any; hourly: any };
  winners: any[];
  logs: any[];
  swaps: any[];
};

function maskWallet(addr: string) {
  if (!addr?.startsWith("0x") || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function msLeft(endsAtMs: number, nowMs: number) {
  return Math.max(0, endsAtMs - nowMs);
}

function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Console() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const closeMainIfNeeded = useMemo(() => {
    if (!data) return false;
    return msLeft(data.rounds.main.endsAtMs, data.nowMs) === 0;
  }, [data]);

  const closeHourlyIfNeeded = useMemo(() => {
    if (!data) return false;
    return msLeft(data.rounds.hourly.endsAtMs, data.nowMs) === 0;
  }, [data]);

  async function loadStatus() {
    const r = await fetch("/api/round/status", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "status failed");
    return j as Snapshot;
  }

  async function sync() {
    const r = await fetch("/api/round/sync", { method: "POST" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "sync failed");
    return j as Snapshot;
  }

  async function close(id: "main" | "hourly") {
    await fetch("/api/round/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        setErr(null);
        const s = await loadStatus();
        if (!alive) return;
        setData(s);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "failed");
      }
    }

    boot();

    const tStatus = setInterval(async () => {
      try {
        const s = await loadStatus();
        if (!alive) return;
        setData(s);
      } catch {}
    }, 1000);

    const tSync = setInterval(async () => {
      try {
        const s = await sync();
        if (!alive) return;
        setData(s);
      } catch {}
    }, 5000);

    return () => {
      alive = false;
      clearInterval(tStatus);
      clearInterval(tSync);
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    if (closeMainIfNeeded) close("main");
    if (closeHourlyIfNeeded) close("hourly");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeMainIfNeeded, closeHourlyIfNeeded]);

  const main = data?.rounds.main;
  const hourly = data?.rounds.hourly;

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <div>
          <div className={styles.tiny}>M O N E Y B A L L &nbsp; C O N S O L E</div>
          <div className={styles.title}>moneyball</div>
        </div>

        <div className={styles.pillRow}>
          <div className={styles.pill}>
            {data ? `${maskWallet(data.poolAddress)} (${data.poolType.toUpperCase()})` : "pool..."}
          </div>
        </div>
      </div>

      {err && <div className={styles.error}>Error: {err}</div>}

      <div className={styles.grid3}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>MAIN ROUND</span>
            <span className={styles.muted}>Buys</span>
          </div>
          <div className={styles.big}>
            {data ? formatClock(msLeft(main.endsAtMs, data.nowMs)) : "--:--"}
          </div>
          <div className={styles.row2}>
            <div>
              <div className={styles.label}>Last buyer</div>
              <div className={styles.value}>{data ? maskWallet(main.lastBuyer) : "—"}</div>
            </div>
            <div className={styles.right}>
              <div className={styles.value}>{data ? main.buys : 0}</div>
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.label}>Payout metric</div>
            <div className={styles.valueAccent}>
              {data ? `$${Number(main.payoutMetricUsd).toFixed(4)}` : "$0.0000"}
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>HOURLY POOL</span>
            <span className={styles.muted}>Buys</span>
          </div>
          <div className={styles.big}>
            {data ? formatClock(msLeft(hourly.endsAtMs, data.nowMs)) : "--:--"}
          </div>
          <div className={styles.row2}>
            <div>
              <div className={styles.label}>Last buyer</div>
              <div className={styles.value}>{data ? maskWallet(hourly.lastBuyer) : "—"}</div>
            </div>
            <div className={styles.right}>
              <div className={styles.value}>{data ? hourly.buys : 0}</div>
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.label}>Payout metric</div>
            <div className={styles.valueAccent}>
              {data ? `$${Number(hourly.payoutMetricUsd).toFixed(4)}` : "$0.0000"}
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span>WALLET</span>
            <span className={styles.muted}>Reserve</span>
          </div>
          <div className={styles.smallNote}>
            Dashboard only (on-chain). Wallet connect can be added later.
          </div>
          <div className={styles.row2}>
            <div>
              <div className={styles.label}>Pool</div>
              <div className={styles.value}>{data ? maskWallet(data.poolAddress) : "—"}</div>
            </div>
            <div className={styles.right}>
              <div className={styles.label}>Type</div>
              <div className={styles.value}>{data ? data.poolType.toUpperCase() : "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>Last winners</div>
          <div className={styles.badge}>
            METRIC <span>{data ? `$${(main.payoutMetricUsd + hourly.payoutMetricUsd).toFixed(4)}` : "$0.0000"}</span>
          </div>
        </div>

        <div className={styles.winnersGrid}>
          <div className={styles.winnerCard}>
            <div className={styles.winnerHead}>MAIN ROUND</div>
            <div className={styles.winnerWallet}>
              {data?.winners?.find((w: any) => w.roundId === "main")?.wallet
                ? maskWallet(data.winners.find((w: any) => w.roundId === "main").wallet)
                : "—"}
            </div>
          </div>

          <div className={styles.winnerCard}>
            <div className={styles.winnerHead}>HOURLY POOL</div>
            <div className={styles.winnerWallet}>
              {data?.winners?.find((w: any) => w.roundId === "hourly")?.wallet
                ? maskWallet(data.winners.find((w: any) => w.roundId === "hourly").wallet)
                : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>Last 20 buys</div>
          <div className={styles.chips}>
            <span className={styles.chip}>BUY</span>
            <span className={styles.chip}>TX</span>
          </div>
        </div>

        <div className={styles.logs}>
          {(data?.swaps || []).map((s: any, idx: number) => (
            <div key={idx} className={styles.logRow}>
              <div className={styles.logKind}>{String(s.roundId).toUpperCase()}</div>
              <div className={styles.logMsg}>
                Buyer: {maskWallet(s.buyer)}
                <br />
                <a target="_blank" rel="noreferrer" href={`https://basescan.org/tx/${s.txHash}`}>
                  {`basescan.org/tx/${s.txHash}`}
                </a>
              </div>
              <div className={styles.logTime}>
                {new Date(s.atMs).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>Logs</div>
          <div className={styles.chips}>
            <span className={styles.chip}>TRADE</span>
            <span className={styles.chip}>WIN</span>
            <span className={styles.chip}>INFO</span>
          </div>
        </div>

        <div className={styles.logs}>
          {(data?.logs || []).slice(0, 25).map((l: any, idx: number) => (
            <div key={idx} className={styles.logRow}>
              <div className={styles.logKind}>{l.kind}</div>
              <div className={styles.logMsg}>
                {l.message}
                {l.txHash ? (
                  <>
                    <br />
                    <a target="_blank" rel="noreferrer" href={`https://basescan.org/tx/${l.txHash}`}>
                      {`basescan.org/tx/${l.txHash}`}
                    </a>
                  </>
                ) : null}
              </div>
              <div className={styles.logTime}>{new Date(l.atMs).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
