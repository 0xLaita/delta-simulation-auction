import { env } from "@/common/utils/envConfig";
import axios from "axios";
import { pino } from "pino";

interface StorageOverride {
  storage: Record<string, string>; // storage slot -> value
}
export type StateOverride = Record<string, StorageOverride>; // contract -> storage override

interface SimulateTransactionRequest {
  from: string | null;
  to: string | null;
  data: string;
  chainId: number;
  timestamp?: number;
  blockNumber?: number;
  stateOverride?: StateOverride;
}

const ACCOUNT_SLUG = env.TENDERLY_ACCOUNT_SLUG;
const PROJECT_SLUG = env.TENDERLY_PROJECT_SLUG;
const ACCESS_TOKEN = env.TENDERLY_ACCESS_TOKEN;

const logger = pino({ name: "Tenderly" });

export class Tenderly {
  private static instance: Tenderly;

  private constructor() {}

  public static getInstance(): Tenderly {
    if (!Tenderly.instance) {
      Tenderly.instance = new Tenderly();
    }

    return Tenderly.instance;
  }

  public async simulateTransaction(request: SimulateTransactionRequest): Promise<string> {
    const data = {
      network_id: request.chainId,
      from: request.from,
      to: request.to,
      input: request.data,
      save: true,
      save_if_fails: true,
      state_objects: request.stateOverride,
    };

    logger.info("Sending transaction simulation with params:");
    logger.info(JSON.stringify(data, null, 2));

    const response = await axios.request({
      method: "POST",
      url: `https://api.tenderly.co/api/v1/account/${ACCOUNT_SLUG}/project/${PROJECT_SLUG}/simulate`,
      headers: {
        "X-Access-Key": ACCESS_TOKEN,
      },
      data,
    });

    const id = response.data.simulation.id;
    const url = `https://dashboard.tenderly.co/${ACCOUNT_SLUG}/${PROJECT_SLUG}/simulator/${id}`;

    logger.info("Successfully simulated settlement transaction:");
    logger.info(`Simulation URL - ${url}`);

    return id;
  }

  public async estimateTransaction(request: SimulateTransactionRequest): Promise<string> {
    const data = {
      network_id: request.chainId,
      from: request.from,
      to: request.to,
      input: request.data,
      save: true,
      save_if_fails: true,
      state_objects: request.stateOverride,
    };

    const response = await axios.request({
      method: "POST",
      url: `https://api.tenderly.co/api/v1/account/${ACCOUNT_SLUG}/project/${PROJECT_SLUG}/simulate`,
      headers: {
        "X-Access-Key": ACCESS_TOKEN,
      },
      data,
    });

    return `0x${BigInt(response.data.transaction.gas_used).toString(16)}`;
  }
}
