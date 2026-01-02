export type SwapSide = "BUY" | "SELL";

export enum OrderKind {
  Sell = 0,
  Buy = 1,
}

export enum OrderType {
  Market = "MARKET",
  Limit = "LIMIT",
}

export enum SettlementMethod {
  SwapSettle = "swapSettle",
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
  type: OrderType;
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
  settlementMethod: SettlementMethod;
  orderData: DeltaOrder;
  signature: string;
  bridgeOverride: DeltaBridgeOverride;
  cosignature: string;
  side: SwapSide;
  partiallyFillable: boolean;
  solution: Solution;
  bridgeDataEncoded: string;
  value: string;
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
