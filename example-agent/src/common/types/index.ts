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

export type DeltaAuctionWithSignature = DeltaAuction & {
  signature: string;
};

export interface Solution {
  solver: string;
  gas: number;
  executedAmount: string;
  calldataToExecute: string;
  executionAddress: string;
  fillPercent?: number;
}
