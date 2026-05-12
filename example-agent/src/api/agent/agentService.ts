import type {
  DeltaBidOrder,
  DeltaBidRequest,
  DeltaBidResponse,
  QuoteRequest,
  QuoteResponse,
  Solution,
} from "@/common/types";
import { type SimpleFetchSDK, SwapSide, constructSimpleSDK } from "@paraswap/sdk";
import axios from "axios";
import { pino } from "pino";

const logger = pino({ name: "Agent" });

const DEFAULT_SLIPPAGE = 500;
// GenericSwapExecutor is the msg.sender on the target call, so the SDK has
// to build the swap calldata expecting that caller.
const GENERIC_SWAP_EXECUTOR_ADDRESS = "0x16B81FE4Ee14c1D395744CE143983825A176A3ac";
const DELTA_BASE_URL = "https://api.paraswap.io/delta";
const LIMIT_ORDERS_API_KEY = process.env.LIMIT_ORDERS_API_KEY;
const AGENT_NAME = process.env.AGENT_NAME ?? "example-agent";

export class AgentService {
  private sdks: Record<number, SimpleFetchSDK> = {};

  public async bid(request: DeltaBidRequest): Promise<DeltaBidResponse> {
    const { chainId, orders } = request;
    const limitOrders = await this.fetchLimitOrders(chainId);
    const solutions = await Promise.all([...orders, ...limitOrders].map((order) => this.bidSingle(chainId, order)));

    return {
      chainId,
      solutions: solutions.filter((solution): solution is Solution => solution !== null),
    };
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
    const { srcToken, destToken, side, srcAmount, destAmount, orderId } = order;
    // SELL quotes are sized by srcAmount; BUY quotes by destAmount.
    const amount = side === SwapSide.BUY ? destAmount : srcAmount;
    logger.info(`Received an order for bid: ${amount} ${srcToken} -> ${destToken} (${side})`);

    try {
      const sdk = this.getSDK(chainId);

      const { priceRoute, txParams } = await sdk.swap.getSwapTxData({
        srcToken,
        destToken,
        amount,
        side,
        userAddress: GENERIC_SWAP_EXECUTOR_ADDRESS,
        slippage: DEFAULT_SLIPPAGE,
      });

      // Quote the full expected swap output. The relayer rebakes the
      // executor's quoted amount against the real settlement-gas estimate and
      // takes the gas cost from the surplus on submission — do NOT pre-deduct
      // gas here.
      const executedAmount = side === SwapSide.BUY ? BigInt(priceRoute.srcAmount) : BigInt(priceRoute.destAmount);

      logger.info(`Returning a bid for ${orderId} with executedAmount=${executedAmount}`);

      return {
        orderId,
        executedAmount: executedAmount.toString(),
        callData: txParams.data,
        target: txParams.to,
        fillPercent: 100,
      };
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}. Error: ${e}`);
      return null;
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
