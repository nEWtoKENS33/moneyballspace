import { createPublicClient, http } from "viem";
import type { Address } from "viem";
import { base } from "viem/chains";

export async function detectPoolType(params: {
  rpcUrl: string;
  poolAddress: Address;
}): Promise<"v2" | "v3"> {
  const client = createPublicClient({
    chain: base,
    transport: http(params.rpcUrl),
  });

  // Uniswap V3 pools have fee() -> uint24
  try {
    await client.readContract({
      address: params.poolAddress,
      abi: [
        {
          type: "function",
          name: "fee",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "uint24" }],
        },
      ] as const,
      functionName: "fee",
    });
    return "v3";
  } catch {
    return "v2";
  }
}
