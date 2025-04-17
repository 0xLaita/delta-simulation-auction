import { deltaAPI } from "@/lib/delta-api/deltaAPI";
import { Wallet } from "ethers";
import { ZERO_ADDRESS } from "../../../../example-agent/src/common/constants";

describe("DeltaAPI", () => {
  const chainId = 1;
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const usdcDecimals = 6;
  const usdtDecimals = 6;
  const amount = "100000000"; // 100 usd
  const owner = Wallet.createRandom().address;

  describe("getPrices", () => {
    it("should fetch delta prices", async () => {
      const prices = await deltaAPI.getPrices({
        chainId,
        srcToken: USDC,
        destToken: USDT,
        srcDecimals: usdcDecimals,
        destDecimals: usdtDecimals,
        amount,
        side: "SELL",
      });

      // todo: assert schema
    });
  });

  describe("buildOrder", () => {
    it("should build delta order", async () => {
      const price = await deltaAPI.getPrices({
        chainId,
        srcToken: USDC,
        destToken: USDT,
        srcDecimals: usdcDecimals,
        destDecimals: usdtDecimals,
        amount,
        side: "SELL",
      });

      const builtOrder = await deltaAPI.buildOrder({
        price,
        chainId,
        owner: USDC,
        bridge: {
          destinationChainId: 0,
          maxRelayerFee: "0",
          multiCallHandler: ZERO_ADDRESS,
          outputToken: ZERO_ADDRESS,
        },
      });

      // todo: assert schema
    });
  });
});
