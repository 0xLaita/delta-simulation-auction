import { randomUUID } from "node:crypto";
import DELTA_ABI from "@/common/abi/delta.abi.json";
import {
  type DeltaBidRequest,
  type DeltaBidResponse,
  type DeltaOrderWithSignature,
  type ExecuteRequest,
  SettlementType,
  type Solution,
} from "@/common/types";
import { env } from "@/common/utils/envConfig";
import { httpAgent } from "@/lib/simulation-auction/httpAgent";
import { orderGenerator } from "@/lib/simulation-auction/orderGenerator";
import { type StateOverride, TenderlySimulator } from "@/lib/tenderly";
import { Interface } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "Simulation Auction" });

const deltaInterface = Interface.from(DELTA_ABI);
const PORTIKUS_ADDRESS = "0x0007005729e310000c6003402d8a0fb700da0c00";
const DELTA_ADDRESS = "0x0000000000bbf5c5fd284e657f01bd000933c96d";
const AGENT_ADDRESS = env.AGENT_ADDRESS;

const DELTA_GAS_OVERHEAD = 250_000;

export class SimulationAuction {
  // static props
  static instances: Record<number, SimulationAuction> = {};
  // instance props
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
      // generate a signed order with id
      const deltaOrderWithSignature = await this.generateOrderWithSignature();
      logger.info("Generated Delta Auction with trade");
      // query the agent for a bid
      const request = this.getBidRequest(deltaOrderWithSignature);
      const solution = await httpAgent.bid(request);
      if (!solution) {
        // terminate if no solution was found
        logger.error("Received no solution for generated auction, terminating the flow...");
        return;
      }
      logger.info(`Received solution for generated auction: ${JSON.stringify(solution)}`);
      // simulate the solution
      const simulation = await this.simulateBidSolution(deltaOrderWithSignature, solution.solutions[0]);
      logger.info(`Solution simulation - ${simulation.url}`);
      if (!simulation.success) {
        // terminate if solution is invalid
        logger.error("Solution simulation reverted, terminating the flow...");
        return;
      }
      // skipping the competition, let the agent execute the order
      const executeRequest = this.getExecuteRequest(deltaOrderWithSignature, solution);
      const { success } = await httpAgent.execute(executeRequest);
      if (success) {
        logger.info("Successfully notified the agent to execute the order");
      } else {
        logger.error("Failed to notify the agent to execute the order");
      }
    } catch (e) {
      logger.error(`Error simulating auction flow: ${e}`);
    }
  }

  async generateOrderWithSignature(): Promise<DeltaOrderWithSignature> {
    const { order, signature } = await orderGenerator.generateSignedOrder(this.chainId);

    return {
      id: randomUUID(),
      chainId: this.chainId,
      order: order,
      signature,
    };
  }

  private async simulateBidSolution(orderWithSignature: DeltaOrderWithSignature, solution: Solution) {
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
    simulator.addAgentRegistryOverride(stateOverride, PORTIKUS_ADDRESS, AGENT_ADDRESS);

    const data =
      solution.settlementType === SettlementType.Swap
        ? this.buildSwapSettlementCalldata(orderWithSignature, solution)
        : this.buildDirectSettlementCalldata(orderWithSignature, solution);

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

  buildSwapSettlementCalldata(order: DeltaOrderWithSignature, solution: Solution) {
    const orderWithSig = {
      order: order.order,
      signature: order.signature,
    };

    return deltaInterface.encodeFunctionData("swapSettle", [
      orderWithSig,
      solution.calldataToExecute,
      solution.executionAddress,
      "0x",
    ]);
  }

  buildDirectSettlementCalldata(order: DeltaOrderWithSignature, solution: Solution) {
    const orderWithSig = {
      order: order.order,
      signature: order.signature,
    };

    return deltaInterface.encodeFunctionData("directSettle", [orderWithSig, solution.executedAmount, "0x"]);
  }

  private getBidRequest(orderWithSignature: DeltaOrderWithSignature): DeltaBidRequest {
    return {
      chainId: orderWithSignature.chainId,
      orders: [
        {
          orderId: orderWithSignature.id,
          srcToken: orderWithSignature.order.srcToken,
          destToken: orderWithSignature.order.destToken,
          side: "SELL",
          srcAmount: orderWithSignature.order.srcAmount,
          destAmount: orderWithSignature.order.destAmount,
          partiallyFillable: false,
          metadata: {
            deltaGasOverhead: DELTA_GAS_OVERHEAD,
          },
        },
      ],
    };
  }

  private getExecuteRequest(orderWithSignature: DeltaOrderWithSignature, bid: DeltaBidResponse): ExecuteRequest {
    const solution = bid.solutions.find((x) => x.orderId === orderWithSignature.id);

    if (!solution) {
      throw new Error(`No solution found for order ${orderWithSignature.id}`);
    }

    return {
      chainId: this.chainId,
      orders: [
        {
          orderId: solution.orderId,
          orderData: { ...orderWithSignature.order, expectedAmount: orderWithSignature.order.expectedDestAmount },
          signature: orderWithSignature.signature,
          side: "SELL",
          partiallyFillable: false,
          solution: solution,
          bridgeDataEncoded: "0x",
        },
      ],
    };
  }
}
