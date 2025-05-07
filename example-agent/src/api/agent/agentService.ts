import DELTA_ABI from "@/common/abi/delta.json";
import { DELTA_ADDRESS, ZERO_ADDRESS } from "@/common/constants";
import {
  type DeltaBidOrder,
  type DeltaBidRequest,
  type DeltaBidResponse,
  type DeltaExecuteOrder,
  type ExecuteRequest,
  type QuoteRequest,
  type QuoteResponse,
  SettlementType,
  type Solution,
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

  public async bid(request: DeltaBidRequest): Promise<DeltaBidResponse> {
    const { chainId, orders } = request;
    const solutions = await Promise.all(orders.map((order) => this.bidSingle(chainId, order)));

    return {
      chainId,
      solutions: solutions.filter((solution) => solution !== null) as Solution[],
    };
  }

  public async execute(request: ExecuteRequest) {
    for (const order of request.orders) {
      try {
        logger.info(`Executing the auction ${order.orderId}`);
        const transaction = await this.buildSettlementTransaction(request.chainId, order);
        const provider = new JsonRpcProvider(env.RPC_URL, request.chainId, {
          batchMaxSize: 1,
        });
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

  public async quote(request: QuoteRequest): Promise<QuoteResponse> {
    const { srcToken, destToken, amount, chainId } = request;
    const sdk = this.getSDK(chainId);

    const priceRoute = await sdk.swap.getRate({
      srcToken,
      destToken,
      amount,
      side: request.side,
    });

    return {
      srcToken,
      destToken,
      srcAmount: priceRoute.srcAmount,
      destAmount: priceRoute.destAmount,
      gas: priceRoute.gasCost,
    };
  }

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

  private async bidSingle(chainId: number, order: DeltaBidOrder): Promise<Solution | null> {
    const { srcToken, destToken, srcAmount: amount } = order;
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
      const totalGas = BigInt(priceRoute.gasCost) + BigInt(order.metadata.deltaGasOverhead ?? DELTA_GAS_OVERHEAD);
      const totalGasFeeInToken = await this.gasToFee(chainId, totalGas.toString(), destToken);

      const executedAmount = executedAmountRaw - BigInt(totalGasFeeInToken);

      logger.info(`Returning a bid for the order with executed amount ${executedAmount}`);

      const executorData: ExecutorData = {
        executionCalldata: txParams.data,
        feeRecipient: ZERO_ADDRESS,
        srcToken: srcToken,
        destToken: destToken,
        feeAmount: "0", // purposely take no fee
      };

      const calldataToExecute = ethers.AbiCoder.defaultAbiCoder().encode(
        ["(bytes executionCalldata,address feeRecipient,address srcToken,address destToken,uint256 feeAmount)"],
        [executorData],
      );

      return {
        orderId: order.orderId,
        executedAmount: executedAmount.toString(),
        calldataToExecute,
        executionAddress: AUGUSTUS_EXECUTOR_ADDRESS,
        fillPercent: 100,
        settlementType: SettlementType.Swap,
      };
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}. Error: ${e}`);
      return null;
    }
  }
  private async buildSettlementTransaction(chainId: number, order: DeltaExecuteOrder): Promise<TransactionRequest> {
    const { orderData, signature } = order;

    const orderWithSig = {
      order: {
        owner: orderData.owner,
        beneficiary: orderData.beneficiary,
        srcToken: orderData.srcToken,
        destToken: orderData.destToken,
        srcAmount: orderData.srcAmount,
        destAmount: orderData.destAmount,
        expectedDestAmount: orderData.expectedAmount,
        nonce: orderData.nonce,
        deadline: orderData.deadline,
        permit: orderData.permit,
        partnerAndFee: orderData.partnerAndFee,
        bridge: orderData.bridge,
      },
      signature,
    };

    const data = deltaInterface.encodeFunctionData("swapSettle", [
      orderWithSig,
      order.solution.calldataToExecute,
      AUGUSTUS_EXECUTOR_ADDRESS,
      order.bridgeDataEncoded,
    ]);

    return {
      from: this.wallet.address,
      to: DELTA_ADDRESS,
      chainId,
      data,
      gasLimit: 1_000_000,
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
