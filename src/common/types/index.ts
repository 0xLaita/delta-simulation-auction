export type SwapSide = "BUY" | "SELL";

export interface StateConfig {
  balanceSlot: string;
  allowanceSlot: string;
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
  state: StateConfig;
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

export interface DeltaBidOrder {
  orderId: string;
  srcToken: string;
  destToken: string;
  side: SwapSide;
  amount: string;
  partiallyFillable: boolean;
}

export interface DeltaBidResponse {
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

export interface DeltaAuctionWithSignature {
  id: string;
  chainId: number;
  order: DeltaOrder;
  signature: string;
}

export interface Solution {
  orderId: string;
  executedAmount: string;
  calldataToExecute: string;
  executionAddress: string;
  fillPercent?: number;
}
