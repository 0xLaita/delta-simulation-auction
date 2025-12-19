import type { DeltaBidRequest, DeltaBidResponse, ExecuteRequest } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import axios, { type AxiosInstance, type AxiosRequestHeaders } from "axios";
import { pino } from "pino";

interface Agent {
  bid(request: DeltaBidRequest): Promise<DeltaBidResponse | null>;
  execute(request: ExecuteRequest): Promise<{ success: boolean }>;
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

  async bid(request: DeltaBidRequest): Promise<DeltaBidResponse | null> {
    try {
      const { data } = await this.axiosInstance.post<DeltaBidResponse | null>(`${this.url}/bid`, request);

      // todo: add return data validation

      return data;
    } catch (e) {
      logger.error(`Failed to provide a solution for request ${JSON.stringify(request)}. Error: ${e}`);
      return null;
    }
  }

  async execute(request: ExecuteRequest): Promise<{ success: boolean }> {
    try {
      const { data } = await this.axiosInstance.post<{ success: true }>(`${this.url}/execute`, request);

      return data;
    } catch (e) {
      logger.error(`Execute failed for agent ${this.name} for request ${request}. Error: ${e}`);

      return {
        success: false,
      };
    }
  }
}

export const httpAgent = new HttpAgent(env.AGENT_NAME, env.AGENT_URL);
