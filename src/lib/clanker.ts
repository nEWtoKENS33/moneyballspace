export async function getEstimatedRewardsUsdByPool(poolAddress: string): Promise<number> {
  const apiKey = process.env.CLANKER_API_KEY;
  if (!apiKey) return 0;

  const url =
    "https://www.clanker.world/api/tokens/estimate-rewards-by-pool-address" +
    `?poolAddress=${encodeURIComponent(poolAddress)}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey },
    next: { revalidate: 15 },
  });

  if (!resp.ok) return 0;

  const data = (await resp.json()) as { userRewards?: number };
  return typeof data.userRewards === "number" ? data.userRewards : 0;
}
