import { randomUUID } from "node:crypto";
import DELTA_ABI from "@/common/abi/delta.abi.json";
import { type DeltaBidRequest, type DeltaOrderWithSignature, OrderKind, type Solution } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import { httpAgent } from "@/lib/simulation-auction/httpAgent";
import { orderGenerator } from "@/lib/simulation-auction/orderGenerator";
import { encodeSwapData } from "@/lib/simulation-auction/swapData";
import { type StateOverride, TenderlySimulator } from "@/lib/tenderly";
import { Interface } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "Simulation Auction" });

const deltaInterface = Interface.from(DELTA_ABI);
const PORTIKUS_ADDRESS = "0x0007005729e310000c6003402d8a0fb700da0c00";
const DELTA_ADDRESS = "0x0000000000bbf5c5fd284e657f01bd000933c96d";
// Production GenericSwapExecutor — same address the relayer routes through.
// Agent bids carry (target, callData) for the underlying DEX; the executor
// here owns the SwapData entrypoint that wraps that call.
const GENERIC_SWAP_EXECUTOR_ADDRESS = "0x16B81FE4Ee14c1D395744CE143983825A176A3ac";
const AGENT_ADDRESS = env.AGENT_ADDRESS;

export class SimulationAuction {
  static instances: Record<number, SimulationAuction> = {};
  interval: NodeJS.Timeout | null = null;

  static getInstance(chainId: number): SimulationAuction {
    if (!SimulationAuction.instances[chainId]) {
      SimulationAuction.instances[chainId] = new SimulationAuction(chainId);
    }
    return SimulationAuction.instances[chainId];
  }

  private constructor(private chainId: number) {}

  start() {
    logger.info("Starting Simulation Auction...");
    void this.simulateAuctionFlow();
    this.interval = setInterval(this.simulateAuctionFlow.bind(this), env.AUCTION_GENERATION_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      logger.info("Stopping Simulation Auction...");
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async simulateAuctionFlow() {
    try {
      const deltaOrderWithSignature = await this.generateOrderWithSignature();
      logger.info("Generated Delta auction with trade");

      // Query the agent for a bid.
      const request = this.getBidRequest(deltaOrderWithSignature);
      const response = await httpAgent.bid(request);
      const solution = response?.solutions.find((s) => s.orderId === deltaOrderWithSignature.id);
      if (!solution) {
        logger.error("Received no solution for generated auction, terminating the flow...");
        return;
      }
      logger.info(`Received solution for generated auction: ${JSON.stringify(solution)}`);

      // The relayer would now wrap (target, callData) into a SwapData payload
      // and submit `swapSettle` / `buySettle` on the delta contract itself —
      // the agent is not involved in execution. We mirror that here against
      // Tenderly so the agent author can verify their bid would have settled.
      const simulation = await this.simulateSettlement(deltaOrderWithSignature, solution);
      logger.info(`Settlement simulation - ${simulation.url}`);
      if (!simulation.success) {
        logger.error("Settlement simulation reverted");
      }
    } catch (e) {
      logger.error(`Error simulating auction flow: ${e}`);
    }
  }

  async generateOrderWithSignature(): Promise<DeltaOrderWithSignature> {
    const { order, signature, bridgeOverride, cosignature } = await orderGenerator.generateSignedOrder(this.chainId);
    return {
      id: randomUUID(),
      chainId: this.chainId,
      order,
      signature,
      bridgeOverride,
      cosignature,
    };
  }

  private async simulateSettlement(orderWithSignature: DeltaOrderWithSignature, solution: Solution) {
    const { order } = orderWithSignature;
    const simulator = TenderlySimulator.getInstance();

    const stateOverride: StateOverride = {};
    const amountToFund = BigInt(order.srcAmount) * 2n;

    await simulator.addAllowanceOverride(
      stateOverride,
      orderWithSignature.chainId,
      order.srcToken,
      order.owner,
      DELTA_ADDRESS,
      amountToFund,
    );
    await simulator.addTokenBalanceOverride(
      stateOverride,
      orderWithSignature.chainId,
      order.srcToken,
      order.owner,
      amountToFund,
    );
    // In production the relayer's EOA submits the settlement tx; here the
    // configured AGENT_ADDRESS plays that role and needs to be registered
    // with Portikus so the delta contract accepts the call.
    simulator.addAgentRegistryOverride(stateOverride, PORTIKUS_ADDRESS, AGENT_ADDRESS);

    const data = this.buildSettlementCalldata(orderWithSignature, solution);

    const simulationRequest = {
      chainId: orderWithSignature.chainId,
      from: AGENT_ADDRESS,
      to: DELTA_ADDRESS,
      data,
      stateOverride,
    };

    const simulation = await simulator.simulateTransaction(simulationRequest);

    return {
      success: simulation.status,
      url: simulator.getSimulationUrl(simulation),
    };
  }

  private buildSettlementCalldata(orderWithSignature: DeltaOrderWithSignature, solution: Solution): string {
    const { order } = orderWithSignature;
    const isBuy = order.kind === OrderKind.Buy;

    const orderWithSig = {
      order,
      signature: orderWithSignature.signature,
      bridgeOverride: orderWithSignature.bridgeOverride,
      cosignature: orderWithSignature.cosignature,
    };

    // Wrap the agent's (target, callData) into the GenericSwapExecutor
    // SwapData payload, exactly as the relayer does in production. The
    // executor decodes this and forwards to `solution.target` with
    // `solution.callData`. quotedAmount is the agent's promised output;
    // any surplus over it goes to feeRecipient.
    const executorData = encodeSwapData({
      isBuy,
      srcToken: order.srcToken,
      destToken: order.destToken,
      quotedAmount: BigInt(solution.executedAmount),
      feeRecipient: AGENT_ADDRESS,
      // No prior allowance on the test executor — let it approve the target.
      shouldApprove: true,
      // Native-ETH src is not supported by the order generator, so 0 is fine.
      value: 0n,
      target: solution.target,
      targetCalldata: solution.callData,
    });

    const methodName = isBuy ? "buySettle" : "swapSettle";
    return deltaInterface.encodeFunctionData(methodName, [
      orderWithSig,
      executorData,
      GENERIC_SWAP_EXECUTOR_ADDRESS,
      "0x",
    ]);
  }

  private getBidRequest(orderWithSignature: DeltaOrderWithSignature): DeltaBidRequest {
    const { order } = orderWithSignature;
    return {
      chainId: orderWithSignature.chainId,
      executor: GENERIC_SWAP_EXECUTOR_ADDRESS,
      orders: [
        {
          orderId: orderWithSignature.id,
          srcToken: order.srcToken,
          destToken: order.destToken,
          side: order.kind === OrderKind.Buy ? "BUY" : "SELL",
          srcAmount: order.srcAmount,
          destAmount: order.destAmount,
          partiallyFillable: false,
        },
      ],
    };
  }
}
