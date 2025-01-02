import type { SwapSide } from "@paraswap/sdk";

export interface DeltaBidRequest {
  chainId: number;
  orders: DeltaBidOrder[];
}

export interface DeltaBidOrder {
  orderId: string;
  srcToken: string;
  destToken: string;
  side: SwapSide;
  amount: string;
  partiallyFillable: boolean;
}

export interface DeltaBidResponse {
  chainId: number;
  orders: Solution[];
}

export interface ExecuteRequest {
  chainId: number;
  orders: DeltaExecuteOrder[];
}

export interface DeltaExecuteOrder {
  orderId: string;
  orderData: DeltaOrder;
  signature: string;
  side: SwapSide;
  partiallyFillable: boolean;
  solution: Solution;
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
