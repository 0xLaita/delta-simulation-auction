import type { DeltaBridge, DeltaOrder, SwapSide } from "@/common/types";
import axios from "axios";
import type { TypedDataDomain, TypedDataField } from "ethers";

const DELTA_API_URL = "https://api.paraswap.io/delta";

interface DeltaPricingParams {
  chainId: number;
  srcToken: string;
  destToken: string;
  amount: string;
  srcDecimals: number;
  destDecimals: number;
  side: SwapSide;
  userAddress?: string;
  partner?: string;
}

interface DeltaBuildOrderParams {
  price: DeltaPrices;
  chainId: number;
  owner: string;
  beneficiary?: string;
  deadline?: number;
  nonce?: string;
  permit?: string;
  partnerAddress?: string;
  partnerFeeBps?: number;
  partnerTakesSurplus?: boolean;
  slippage?: number;
  partiallyFillable?: boolean;
  side?: SwapSide;
  metadata?: string;
  bridge?: DeltaBridge;
}

interface DeltaPrices {
  srcToken: string;
  destToken: string;
  srcAmount: string;
  destAmount: string;
  destAmountBeforeFee: string;
  gasCostUSD: string;
  gasCostUSDBeforeFee: string;
  gasCost: string;
  gasCostBeforeFee: string;
  srcUSD: string;
  destUSD: string;
  destUSDBeforeFee: string;
  partner: string;
  partnerFee: number;
  hmac: string;
}

interface DeltaBuiltOrder {
  toSign: {
    domain: TypedDataDomain;
    types: Record<string, Array<TypedDataField>>;
    value: DeltaOrder;
  };
}

class DeltaAPI {
  private deltaUrl = DELTA_API_URL;

  async getPrices(params: DeltaPricingParams): Promise<DeltaPrices> {
    const { data } = await axios.get<{ price: DeltaPrices }>(`${this.deltaUrl}/prices`, { params });

    return data.price;
  }

  async buildOrder(params: DeltaBuildOrderParams): Promise<DeltaBuiltOrder> {
    const { data } = await axios.post<DeltaBuiltOrder>(`${this.deltaUrl}/orders/build`, params);

    return data;
  }
}

export const deltaAPI = new DeltaAPI();
