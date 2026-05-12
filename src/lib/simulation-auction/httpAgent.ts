import type { DeltaBidRequest, DeltaBidResponse } from "@/common/types";
import { env } from "@/common/utils/envConfig";
import axios, { type AxiosInstance, type AxiosRequestHeaders, isAxiosError } from "axios";
import { pino } from "pino";

interface Agent {
  bid(request: DeltaBidRequest): Promise<DeltaBidResponse | null>;
}

const logger = pino({ name: "Agent" });

// Axios surfaces failed connection attempts as a Node `AggregateError` whose
// `toString()` is just "AggregateError" — useless for debugging. Walk into
// it so the operator sees the actual cause (ECONNREFUSED, ENOTFOUND, etc).
const describeError = (e: unknown): string => {
  if (isAxiosError(e)) {
    const status = e.response?.status;
    const url = e.config?.url;
    if (status) return `HTTP ${status} from ${url}: ${JSON.stringify(e.response?.data)}`;
    const cause = (e.cause as { errors?: unknown[]; code?: string; message?: string } | undefined) ?? undefined;
    if (cause?.errors && Array.isArray(cause.errors)) {
      return `${e.code ?? "request failed"} to ${url}: [${cause.errors.map((x) => String(x)).join(", ")}]`;
    }
    return `${e.code ?? "request failed"} to ${url}: ${e.message}`;
  }
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
};

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
      return data;
    } catch (e) {
      logger.error(`Bid request to ${this.name} at ${this.url}/bid failed: ${describeError(e)}`);
      return null;
    }
  }
}

export const httpAgent = new HttpAgent(env.AGENT_NAME, env.AGENT_URL);
