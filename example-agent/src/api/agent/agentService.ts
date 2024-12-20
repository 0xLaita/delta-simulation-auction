import DELTA_ABI from "@/common/abi/delta.json";
import { DELTA_ADDRESS, ZERO_ADDRESS } from "@/common/constants";
import type { DeltaAuctionWithSignature, DeltaOrder, Solution } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import { type SimpleFetchSDK, SwapSide, constructSimpleSDK } from "@paraswap/sdk";
import axios from "axios";
import { Interface, JsonRpcProvider, type TransactionRequest, Wallet, ethers } from "ethers";
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

const DEFAULT_SLIPPAGE = 500;
const AUGUSTUS_EXECUTOR_ADDRESS = "0x6bb000067005450704003100632eb93ea00c0000";

export class AgentService {
  private sdks: Record<number, SimpleFetchSDK> = {};
  private wallet = Wallet.createRandom();

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
    logger.info(`Received an order for bid: ${amount} ${srcToken} -> ${destAmount} ${destToken}`);

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

      logger.info(`Returning a bid for the order with executed amount ${executedAmount}`);

      return {
        solver: "paraswap",
        gas: Number(priceRoute.gasCost),
        executedAmount: executedAmount.toString(),
        calldataToExecute: txParams.data,
        executionAddress: txParams.to,
        fillPercent: 100,
      };
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}. Error: ${e}`);
      return null;
    }
  }

  async execute(auction: DeltaAuctionWithSignature, solution: Solution) {
    try {
      logger.info(`Executing the auction ${auction.id}`);
      const transaction = await this.buildSettlementTransaction(auction, solution);
      const provider = new JsonRpcProvider(env.RPC_URL, auction.chainId, { batchMaxSize: 1 });
      const { gasPrice, maxPriorityFeePerGas, maxFeePerGas } = await provider.getFeeData();
      const feeData = maxPriorityFeePerGas && maxFeePerGas ? { maxPriorityFeePerGas, maxFeePerGas } : { gasPrice };
      const response = await this.wallet.connect(provider).sendTransaction({
        ...transaction,
        ...feeData,
      });
      logger.info(`Successfully executed the auction ${auction.id}, transaction hash - ${response.hash}`);

      return true;
    } catch (e) {
      logger.error(`Failed to execute auction ${auction.id}`, e);
      return false;
    }
  }

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
      from: this.wallet.address,
      to: DELTA_ADDRESS,
      chainId: auction.chainId,
      data,
    };
  }
}

export const userService = new AgentService();
