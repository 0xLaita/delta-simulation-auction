import type { DeltaAuctionWithSignature, DeltaOrder, Solution } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import axios, { type AxiosInstance, type AxiosRequestHeaders } from "axios";
import { pino } from "pino";

interface Agent {
  bid(chainId: number, order: DeltaOrder, partner: string): Promise<Solution | null>;
  execute(auction: DeltaAuctionWithSignature, solution: Solution): Promise<{ success: boolean }>;
}

const logger = pino({ name: "Agent" });

export class HttpAgent implements Agent {
  private axiosInstance: AxiosInstance;

  constructor(
    private name: string,
    private url: string,
    private authHeaders?: AxiosRequestHeaders,
  ) {
    this.axiosInstance = axios.create({ headers: this.authHeaders });
  }

  async bid(chainId: number, order: DeltaOrder, partner = "anon"): Promise<Solution | null> {
    try {
      const { data } = await this.axiosInstance.post<Solution | null>(`${this.url}/bid`, { chainId, order, partner });

      // todo: add return data validation

      return data;
    } catch (e) {
      logger.error(`Failed to provide a solution for order ${JSON.stringify(order)}`, e);
      return null;
    }
  }

  async execute(auction: DeltaAuctionWithSignature, solution: Solution): Promise<{ success: boolean }> {
    try {
      const { data } = await this.axiosInstance.post<{ success: true }>(`${this.url}/execute`, {
        auction,
        solution,
      });

      return data;
    } catch (e) {
      logger.error(`Execute failed for agent ${this.name} for auction ${auction.id}`);

      return {
        success: false,
      };
    }
  }
}

export const httpAgent = new HttpAgent(env.AGENT_NAME, env.AGENT_URL);
