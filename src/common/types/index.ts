export type SwapSide = "BUY" | "SELL";

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
  orders: DeltaBidOrder[];
}

export interface DeltaBidOrderMetadata {
  deltaGasOverhead?: number | null;
}

// Order data sent to agents during bidding stage
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
  metadata: DeltaBidOrderMetadata;
}

export interface DeltaBidResponse {
  solutions: Solution[];
}

export interface ExecuteRequest {
  chainId: number;
  orders: DeltaExecuteOrder[];
}

export interface DeltaExecuteOrder {
  orderId: string;
  orderData: OnChainDeltaOrderData;
  signature: string;
  side: SwapSide;
  partiallyFillable: boolean;
  solution: Solution;
  bridgeDataEncoded: string;
}

export interface DeltaBridge {
  maxRelayerFee: string;
  destinationChainId: number;
  outputToken: string;
  multiCallHandler: string;
}

export interface DeltaOrder {
  owner: string;
  beneficiary: string;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  expectedDestAmount: string;
  deadline: number;
  nonce: string;
  partnerAndFee: string;
  permit: string;
  bridge: DeltaBridge;
}

// todo: remove this and use `Order` type after BUY release
export type OnChainDeltaOrderData = Omit<DeltaOrder, "expectedDestAmount"> & {
  expectedAmount: string;
};

export interface DeltaOrderWithSignature {
  id: string;
  chainId: number;
  order: DeltaOrder;
  signature: string;
}

export const SettlementType = {
  Swap: "SWAP",
  Direct: "DIRECT",
} as const;

export type SettlementType = (typeof SettlementType)[keyof typeof SettlementType];

export interface Solution {
  orderId: string;
  executedAmount: string;
  calldataToExecute: string;
  executionAddress: string;
  settlementType: SettlementType;
  fillPercent?: number;
}
