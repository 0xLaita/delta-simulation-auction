import { randomUUID } from "node:crypto";
import type { DeltaAuctionWithSignature, DeltaBidRequest, DeltaBidResponse, ExecuteRequest } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import { orderGenerator } from "@/lib/simulation-auction/orderGenerator";
import { pino } from "pino";
import { httpAgent } from "./httpAgent";

const logger = pino({ name: "Simulation Auction" });

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
      // generate auction
      const deltaAuction = await this.generateAuction();
      logger.info("Generated Delta Auction with trade");
      // query the agent for a bid
      const request = this.getBidRequest(deltaAuction);
      const solution = await httpAgent.bid(request);
      if (!solution) {
        // terminate if no solution was found
        logger.error("Received no solution for generated auction, terminating the flow...");
        return;
      }
      // skipping the competition, let the agent execute the order
      const executeRequest = this.getExecuteRequest(deltaAuction, solution);
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

  async generateAuction(): Promise<DeltaAuctionWithSignature> {
    // generate signed order
    const { order, signature } = await orderGenerator.generateSignedOrder(this.chainId);
    // return the generated auction
    return {
      id: randomUUID(),
      chainId: this.chainId,
      order: order,
      signature,
    };
  }

  private getBidRequest(auction: DeltaAuctionWithSignature): DeltaBidRequest {
    return {
      chainId: auction.chainId,
      orders: [
        {
          orderId: auction.id,
          srcToken: auction.order.srcToken,
          destToken: auction.order.destToken,
          side: "SELL",
          srcAmount: auction.order.srcAmount,
          destAmount: auction.order.destAmount,
          partiallyFillable: false,
        },
      ],
    };
  }

  private getExecuteRequest(auction: DeltaAuctionWithSignature, bid: DeltaBidResponse): ExecuteRequest {
    const solution = bid.orders.find((x) => x.orderId === auction.id);

    if (!solution) {
      throw new Error("No solution found for order ${auction.id}");
    }

    return {
      chainId: this.chainId,
      orders: [
        {
          orderId: solution.orderId,
          orderData: { ...auction.order, expectedAmount: auction.order.expectedDestAmount },
          signature: auction.signature,
          side: "SELL",
          partiallyFillable: false,
          solution: solution,
        },
      ],
    };
  }
}
