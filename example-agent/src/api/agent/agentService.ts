import DELTA_ABI from "@/common/abi/delta.json";
import { DELTA_ADDRESS, ZERO_ADDRESS } from "@/common/constants";
import type {
  DeltaBidOrder,
  DeltaBidRequest,
  DeltaBidResponse,
  DeltaExecuteOrder,
  ExecuteRequest,
  Solution,
} from "@/common/types";
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
const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DELTA_GAS_OVERHEAD = 250_000n;

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

  public async bid(request: DeltaBidRequest): Promise<DeltaBidResponse> {
    const { chainId, orders } = request;
    const solutions = await Promise.all(orders.map((order) => this.bidSingle(chainId, order)));

    return {
      chainId,
      orders: solutions.filter((solution) => solution !== null) as Solution[],
    };
  }

  async execute(request: ExecuteRequest) {
    for (const order of request.orders) {
      try {
        logger.info(`Executing the auction ${order.orderId}`);
        const transaction = await this.buildSettlementTransaction(request.chainId, order);
        const provider = new JsonRpcProvider(env.RPC_URL, request.chainId, { batchMaxSize: 1 });
        const { gasPrice, maxPriorityFeePerGas, maxFeePerGas } = await provider.getFeeData();
        const feeData = maxPriorityFeePerGas && maxFeePerGas ? { maxPriorityFeePerGas, maxFeePerGas } : { gasPrice };
        const response = await this.wallet.connect(provider).sendTransaction({
          ...transaction,
          ...feeData,
        });
        logger.info(`Successfully executed the auction ${order.orderId}, transaction hash - ${response.hash}`);
      } catch (e) {
        logger.error(`Failed to execute order ${order.orderId}. Error ${e}`);
      }
    }

    return true;
  }

  private async bidSingle(chainId: number, order: DeltaBidOrder): Promise<Solution | null> {
    const { srcToken, destToken, amount } = order;
    logger.info(`Received an order for bid: ${amount} ${srcToken} -> ${destToken}`);

    try {
      const sdk = this.getSDK(chainId);

      const { priceRoute, txParams } = await sdk.swap.getSwapTxData({
        srcToken,
        destToken,
        amount,
        side: order.side,
        userAddress: AUGUSTUS_EXECUTOR_ADDRESS,
        slippage: DEFAULT_SLIPPAGE,
      });

      const executedAmountRaw = BigInt(priceRoute.destAmount);
      const totalGas = BigInt(priceRoute.gasCost) + DELTA_GAS_OVERHEAD;
      const totalGasFeeInToken = await this.gasToFee(chainId, totalGas.toString(), destToken);

      const executedAmount = executedAmountRaw - BigInt(totalGasFeeInToken);

      logger.info(`Returning a bid for the order with executed amount ${executedAmount}`);

      return {
        orderId: order.orderId,
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
  private async buildSettlementTransaction(chainId: number, order: DeltaExecuteOrder): Promise<TransactionRequest> {
    const { calldataToExecute: executionCalldata } = order.solution;
    const { orderData, signature } = order;

    const executorData: ExecutorData = {
      executionCalldata,
      feeRecipient: ZERO_ADDRESS,
      srcToken: orderData.srcToken,
      destToken: orderData.destToken,
      feeAmount: "1", // purposely take no fee
    };

    const orderWithSig = { order: order.orderData, signature };

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
      chainId,
      data,
    };
  }

  private async gasToFee(chainId: number, gas: string, tokenAddress: string): Promise<string> {
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
      return gas;
    }

    const sdk = this.getSDK(chainId);

    try {
      const priceRoute = await sdk.swap.getRate({
        srcToken: NATIVE_TOKEN_ADDRESS,
        destToken: tokenAddress,
        amount: gas,
        side: SwapSide.BUY,
      });

      const fee = priceRoute.destAmount;

      return fee;
    } catch (e) {
      logger.error(`Error getting fee amount in token ${tokenAddress}`, e);
      throw e;
    }
  }
}

export const userService = new AgentService();
