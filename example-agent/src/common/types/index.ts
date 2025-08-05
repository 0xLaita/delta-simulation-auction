import type { SwapSide } from "@paraswap/sdk";

export interface DeltaBidRequest {
  chainId: number;
  orders: DeltaBidOrder[];
}

export interface DeltaBridge {
  maxRelayerFee: string;
  destinationChainId: number;
  outputToken: string;
  multiCallHandler: string;
}

export interface DeltaBidOrderMetadata {
  deltaGasOverhead?: number | null;
}

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
  chainId: number;
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

export interface DeltaOrder {
  owner: string;
  beneficiary: string;
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  expectedAmount: string;
  deadline: number;
  kind: number;
  nonce: string;
  partnerAndFee: string;
  metadata: string;
  permit: string;
  bridge: DeltaBridge;
}

export type OnChainDeltaOrderData = Omit<DeltaOrder, "expectedDestAmount"> & {
  expectedAmount: string;
};

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
