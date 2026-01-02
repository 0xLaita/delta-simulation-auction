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
  SettlementMethod,
  SettlementType,
  type Solution,
} from "@/common/types";
import { env } from "@/common/utils/envConfig";
import { type SimpleFetchSDK, SwapSide, type TransactionParams, constructSimpleSDK } from "@paraswap/sdk";
import axios from "axios";
import { Interface, JsonRpcProvider, type TransactionRequest, Wallet, ethers } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "Agent" });

interface SellExecutorData {
  executionCalldata: string;
  feeRecipient: string;
  srcToken: string;
  destToken: string;
  feeAmount: string;
}

interface BuyExecutorData {
  executorCalldata: string;
  feeRecipient: string;
  srcToken: string;
  destToken: string;
  quotedAmount: string;
  destAmount: string;
  approveSrc: boolean;
}

const deltaInterface = Interface.from(DELTA_ABI);

const DEFAULT_SLIPPAGE = 500;
const AUGUSTUS_EXECUTOR_ADDRESS = "0x6bb000067005450704003100632eb93ea00c0000";
const AUGUSTUS_BUY_EXECUTOR_ADDRESS = "0xAEF1fb85eD2D8920527c6883F318493EEB359B46";
const NATIVE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DELTA_GAS_OVERHEAD = 250_000n;
const DELTA_BASE_URL = "https://api.paraswap.io/delta";
const LIMIT_ORDERS_API_KEY = process.env.LIMIT_ORDERS_API_KEY;
const AGENT_NAME = process.env.AGENT_NAME ?? "example-agent";

export class AgentService {
  private sdks: Record<number, SimpleFetchSDK> = {};
  private readonly wallet = Wallet.createRandom();

  public async bid(request: DeltaBidRequest): Promise<DeltaBidResponse> {
    const { chainId, orders } = request;
    const limitOrders = await this.fetchLimitOrders(chainId);
    const solutions = await Promise.all([...orders, ...limitOrders].map((order) => this.bidSingle(chainId, order)));

    return {
      chainId,
      solutions: solutions.filter((solution) => solution !== null),
    };
  }

  public async execute(request: ExecuteRequest) {
    for (const order of request.orders) {
      try {
        if (order.settlementMethod !== SettlementMethod.SwapSettle) {
          logger.info("Only Swap settlement is supported");
          continue;
        }

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

      const calldataToExecute = this.getCalldataToExecute(order, txParams, srcToken, destToken, executedAmount, amount);

      const executionAddress = order.side === SwapSide.BUY ? AUGUSTUS_BUY_EXECUTOR_ADDRESS : AUGUSTUS_EXECUTOR_ADDRESS;

      return {
        orderId: order.orderId,
        executedAmount: executedAmount.toString(),
        calldataToExecute,
        executionAddress,
        fillPercent: 100,
        settlementType: SettlementType.Swap,
      };
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}. Error: ${e}`);
      return null;
    }
  }

  private getCalldataToExecute(
    order: DeltaBidOrder,
    txParams: TransactionParams,
    srcToken: string,
    destToken: string,
    executedAmount: bigint,
    amount: string,
  ) {
    if (order.side === SwapSide.SELL) {
      const executorData: SellExecutorData = {
        executionCalldata: txParams.data,
        feeRecipient: ZERO_ADDRESS,
        srcToken: srcToken,
        destToken: destToken,
        feeAmount: "0", // purposely take no fee
      };

      return ethers.AbiCoder.defaultAbiCoder().encode(
        ["(bytes executionCalldata,address feeRecipient,address srcToken,address destToken,uint256 feeAmount)"],
        [executorData],
      );
    }

    const executorData: BuyExecutorData = {
      executorCalldata: txParams.data,
      feeRecipient: ZERO_ADDRESS,
      srcToken: srcToken,
      destToken: destToken,
      quotedAmount: executedAmount.toString(),
      destAmount: amount,
      approveSrc: true,
    };

    return ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "(bytes executorCalldata,address feeRecipient,address srcToken, address destToken,uint256 quotedAmount,uint256 destAmount,bool approveSrc)",
      ],
      [executorData],
    );
  }

  private async buildSettlementTransaction(chainId: number, order: DeltaExecuteOrder): Promise<TransactionRequest> {
    const { orderData, signature, bridgeOverride, cosignature } = order;

    const orderWithSig = {
      order: {
        owner: orderData.owner,
        beneficiary: orderData.beneficiary,
        srcToken: orderData.srcToken,
        destToken: orderData.destToken,
        srcAmount: orderData.srcAmount,
        destAmount: orderData.destAmount,
        expectedAmount: orderData.expectedAmount,
        nonce: orderData.nonce,
        deadline: orderData.deadline,
        permit: orderData.permit,
        partnerAndFee: orderData.partnerAndFee,
        kind: orderData.kind,
        metadata: orderData.metadata,
        bridge: orderData.bridge,
      },
      signature,
      bridgeOverride,
      cosignature,
    };

    const settlementFunctionName = order.side === SwapSide.SELL ? "swapSettle" : "buySettle";
    const data = deltaInterface.encodeFunctionData(settlementFunctionName, [
      orderWithSig,
      order.solution.calldataToExecute,
      order.solution.executionAddress,
      order.bridgeDataEncoded,
    ]);

    return {
      from: this.wallet.address,
      to: DELTA_ADDRESS,
      value: order.value,
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

  private async fetchLimitOrders(chainId: number): Promise<DeltaBidOrder[]> {
    if (!LIMIT_ORDERS_API_KEY) {
      logger.warn("No limit orders API key provided, skipping fetching limit orders");

      return [];
    }

    try {
      return await axios
        .get<DeltaBidOrder[]>(`${DELTA_BASE_URL}/orders/orderbook/${chainId}/${AGENT_NAME}`, {
          headers: {
            "x-api-key": LIMIT_ORDERS_API_KEY,
          },
        })
        .then((x) => x.data);
    } catch (e) {
      logger.error(`Failed to fetch limit orders for chain ${chainId}`, e);

      return [];
    }
  }
}

export const userService = new AgentService();
