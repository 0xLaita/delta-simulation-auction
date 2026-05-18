export type SwapSide = "BUY" | "SELL";

export enum OrderKind {
  Sell = 0,
  Buy = 1,
}

export interface AmountsConfig {
  min: string;
  max: string;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  amounts: AmountsConfig;
}

export type ChainTokensConfig = Record<number, Record<string, TokenConfig>>;

export interface Token {
  name?: string;
  symbol: string;
  address: string;
  decimals: number;
}

export interface DeltaBidRequest {
  chainId: number;
  // Address that will call the agent-provided `target` with the
  // agent-provided `callData` during settlement. Agents should build
  // their bid calldata expecting this caller (e.g. pass it as
  // `userAddress` on ParaSwap SDK calls).
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
  solutions: Solution[];
}

export interface DeltaBridge {
  protocolSelector: string;
  destinationChainId: number;
  outputToken: string;
  scalingFactor: number;
  protocolData: string;
}

export interface DeltaBridgeOverride {
  protocolSelector: string;
  protocolData: string;
}

export interface DeltaOrder {
  owner: string;
  beneficiary: string;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  expectedAmount: string;
  deadline: number;
  kind: OrderKind;
  nonce: string;
  partnerAndFee: string;
  permit: string;
  metadata: string;
  bridge: DeltaBridge;
}

export interface DeltaOrderWithSignature {
  id: string;
  chainId: number;
  order: DeltaOrder;
  signature: string;
  bridgeOverride: DeltaBridgeOverride;
  cosignature: string;
}

// What the agent returns for each order. The relayer (or, here, the simulator)
// wraps `(target, callData)` into a GenericSwapExecutor SwapData payload
// before submission.
export interface Solution {
  orderId: string;
  executedAmount: string;
  callData: string;
  target: string;
  fillPercent?: number;
}
