import AUGUSTUS_EXECUTOR from "@/common/abi/augustus-executor.json";
import DELTA_ABI from "@/common/abi/delta.json";
import { DELTA_ADDRESS } from "@/common/constants";
import type { DeltaAuctionWithSignature, DeltaOrder, Solution } from "@/common/types";
import { type SimpleFetchSDK, SwapSide, constructSimpleSDK } from "@paraswap/sdk";
import { ZERO_ADDRESS } from "@paraswap/sdk/dist/methods/common/orders/buildOrderData";
import axios from "axios";
import { Interface, type TransactionRequest, ethers } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "Agent" });

interface ExecutorData {
  executionCalldata: string;
  feeRecipient: string;
  srcToken: string;
  destToken: string;
  feeAmount: string;
}

const deltaInterface = Interface.from(DELTA_ABI);
const augustusExecutorInterface = Interface.from(AUGUSTUS_EXECUTOR);

const DEFAULT_SLIPPAGE = 500;
const AUGUSTUS_EXECUTOR_ADDRESS = "0x6bb000067005450704003100632eb93ea00c0000";

export class AgentService {
  private sdks: Record<number, SimpleFetchSDK> = {};

  private getSDK(chainId: number): SimpleFetchSDK {
    if (!this.sdks[chainId]) {
      this.sdks[chainId] = constructSimpleSDK({
        version: "6.2",
        chainId,
        axios,
      });
    }

    return this.sdks[chainId];
  }

  async bid(chainId: number, order: DeltaOrder, partner: string): Promise<Solution | null> {
    const { srcToken, destToken, srcAmount: amount, destAmount } = order;

    try {
      const sdk = this.getSDK(chainId);

      const { priceRoute, txParams } = await sdk.swap.getSwapTxData({
        srcToken,
        destToken,
        amount,
        side: SwapSide.SELL,
        userAddress: AUGUSTUS_EXECUTOR_ADDRESS,
        slippage: DEFAULT_SLIPPAGE,
        options: {
          partner,
        },
      });

      const executedAmount = BigInt(priceRoute.destAmount);

      if (executedAmount < BigInt(destAmount)) {
        logger.warn(
          `Returned amount ${executedAmount} is less than minimum amount ${destAmount} for order: ${JSON.stringify(
            order,
          )}`,
        );

        return null;
      }

      return {
        solver: "paraswap",
        gas: Number(priceRoute.gasCost),
        executedAmount: executedAmount.toString(),
        calldataToExecute: txParams.data,
        executionAddress: txParams.to,
        fillPercent: 100,
      };
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}`, e);
      return null;
    }
  }

  async execute(auction: DeltaAuctionWithSignature, solution: Solution) {}

  private async buildSettlementTransaction(
    auction: DeltaAuctionWithSignature,
    solution: Solution,
  ): Promise<TransactionRequest> {
    const { calldataToExecute: executionCalldata, executedAmount, executionAddress } = solution;
    const { order, signature } = auction;

    const executorData: ExecutorData = {
      executionCalldata,
      feeRecipient: ZERO_ADDRESS,
      srcToken: order.srcToken,
      destToken: order.destToken,
      feeAmount: "1", // purposely take no fee
    };

    const orderWithSig = { order, signature };

    const executorDataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["(bytes executionCalldata,address feeRecipient,address srcToken,address destToken,uint256 feeAmount)"],
      [executorData],
    );
    const data = deltaInterface.encodeFunctionData("swapSettle", [
      orderWithSig,
      executorDataEncoded,
      AUGUSTUS_EXECUTOR_ADDRESS,
    ]);

    return {
      to: DELTA_ADDRESS,
      chainId: auction.chainId,
      data,
    };
  }
}

export const userService = new AgentService();
