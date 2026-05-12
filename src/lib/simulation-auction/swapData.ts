import { AbiCoder, getAddress } from "ethers";

// Matches GenericSwapExecutor.SwapData (portikus-contracts). Field order and
// types are kept in lockstep with the on-chain tuple — the executor decodes
// these bytes directly. The relayer builds the same payload in production
// (see trade-relayer's solution-rewriter / swap-data.ts).
const SWAP_DATA_TUPLE =
  "tuple(bool isBuy,address srcToken,address destToken,uint256 quotedAmount," +
  "address feeRecipient,bool shouldApprove,uint256 value,address target,bytes targetCalldata)";

const abi = AbiCoder.defaultAbiCoder();

export interface SwapDataFields {
  isBuy: boolean;
  srcToken: string;
  destToken: string;
  quotedAmount: bigint;
  feeRecipient: string;
  shouldApprove: boolean;
  value: bigint;
  target: string;
  targetCalldata: string;
}

export const encodeSwapData = (fields: SwapDataFields): string =>
  abi.encode(
    [SWAP_DATA_TUPLE],
    [
      {
        isBuy: fields.isBuy,
        srcToken: getAddress(fields.srcToken),
        destToken: getAddress(fields.destToken),
        quotedAmount: fields.quotedAmount,
        feeRecipient: getAddress(fields.feeRecipient),
        shouldApprove: fields.shouldApprove,
        value: fields.value,
        target: getAddress(fields.target),
        targetCalldata: fields.targetCalldata,
      },
    ],
  );
