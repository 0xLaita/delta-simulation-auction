import type { SwapSide } from "@paraswap/sdk";

export interface DeltaBidRequest {
  chainId: number;
  // Address that will call the agent-provided `target` with the
  // agent-provided `callData` during settlement. The bid calldata must
  // be built expecting this caller (e.g. passed as `userAddress` on
  // ParaSwap SDK calls).
  executor: string;
  orders: DeltaBidOrder[];
}

// Order data sent to agents during the bidding stage.
export interface DeltaBidOrder {
  orderId: string;
  srcToken: string;
  destToken: string;
  side: SwapSide;
  // for SELL, `destAmount` means minDestAmount,
  // and for BUY, `srcAmount` means maxSrcAmount
  srcAmount: string;
  destAmount: string;
  partiallyFillable: boolean;
}

export interface DeltaBidResponse {
  chainId: number;
  solutions: Solution[];
}

// What the agent returns for each order. The relayer wraps (target, callData)
// into a GenericSwapExecutor SwapData payload before submitting on-chain — the
// agent does not need to encode SwapData itself.
export interface Solution {
  orderId: string;
  executedAmount: string;
  callData: string;
  target: string;
  fillPercent?: number;
}

export type QuoteRequest = {
  srcToken: string;
  destToken: string;
  amount: string;
  srcDecimals?: number;
  destDecimals?: number;
  side: SwapSide;
  chainId: number;
};

export type QuoteResponse = {
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  gas: string;
};
