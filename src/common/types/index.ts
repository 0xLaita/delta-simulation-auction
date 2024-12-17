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

export interface DeltaAuction {
  id: string;
  chainId: number;
  order: DeltaOrder;
}

export interface DeltaAuctionWithSignature {
  id: string;
  chainId: number;
  order: DeltaOrder;
  signature: string;
}

export interface Solution {
  solver: string;
  gas: number;
  executedAmount: string;
  calldataToExecute: string;
  executionAddress: string;
  fillPercent?: number;
}
