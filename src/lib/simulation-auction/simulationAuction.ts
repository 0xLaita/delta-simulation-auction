import { randomUUID } from "node:crypto";
import type { DeltaAuctionWithSignature } from "@/common/types";
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
    // generate auction
    const deltaAuction = await this.generateAuction();
    // query the agent for a bid
    const solution = await httpAgent.bid(this.chainId, deltaAuction.order);
    if (!solution) {
      // terminate if no solution was found
      logger.error("Received no solution for generated auction, terminating the flow...");
      return;
    }
    // skipping the competition, let the agent execute the order
    const { success } = await httpAgent.execute(deltaAuction, solution);
    if (success) {
      logger.info("Successfully notified the agent to execute the order");
    } else {
      logger.error("Failed to notify the agent to execute the order");
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
}
