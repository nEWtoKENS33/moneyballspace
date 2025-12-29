import { createPublicClient, http, parseAbiItem } from "viem";
import type { Address } from "viem";
import { base } from "viem/chains";

const swapV3 = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);

const swapV2 = parseAbiItem(
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
);

function getSwapEvent(poolType: "v2" | "v3") {
  return poolType === "v2" ? swapV2 : swapV3;
}

export function makeBaseClient(rpcUrl: string) {
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

export async function getCurrentBlockNumber(rpcUrl: string): Promise<bigint> {
  const client = makeBaseClient(rpcUrl);
  return client.getBlockNumber();
}

export async function scanSwaps(params: {
  rpcUrl: string;
  poolAddress: Address;
  poolType: "v2" | "v3";
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<
  Array<{
    txHash: `0x${string}`;
    blockNumber: bigint;
    logIndex: number; // ✅ viem uses number
    buyer: Address;
  }>
> {
  const client = makeBaseClient(params.rpcUrl);
  const event = getSwapEvent(params.poolType);

  const logs = await client.getLogs({
    address: params.poolAddress,
    event,
    fromBlock: params.fromBlock,
    toBlock: params.toBlock,
  });

  const mapped = logs.map((l) => {
    const txHash = l.transactionHash as `0x${string}`;
    const blockNumber = l.blockNumber!;
    const logIndex = l.logIndex!; // number
    const args: any = l.args;

    // Buyer policy:
    // - V3: recipient
    // - V2: to
    const buyer = (params.poolType === "v2" ? args.to : args.recipient) as Address;

    return { txHash, blockNumber, logIndex, buyer };
  });

  mapped.sort((a, b) => {
    if (a.blockNumber === b.blockNumber) return a.logIndex - b.logIndex;
    return a.blockNumber < b.blockNumber ? -1 : 1;
  });

  return mapped;
}

export function maskWallet(addr: string) {
  if (!addr?.startsWith("0x") || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
