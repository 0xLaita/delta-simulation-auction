import type { ChainTokensConfig, DeltaBridgeOverride, DeltaOrder, SwapSide, Token } from "@/common/types";
import tokens from "@/lib/data/tokens.json";
import { deltaAPI } from "@/lib/delta-api/deltaAPI";
import { type HDNodeWallet, Signature, Wallet, ZeroAddress, ethers } from "ethers";
import { pino } from "pino";

interface SignedOrder {
  order: DeltaOrder;
  signature: string;
  bridgeOverride: DeltaBridgeOverride;
  cosignature: string;
  chainId: number;
}

const EMPTY_BRIDGE = {
  protocolSelector: "0x00000000",
  destinationChainId: 0,
  outputToken: ZeroAddress,
  scalingFactor: 0,
  protocolData: "0x",
};

const EMPTY_BRIDGE_OVERRIDE = {
  protocolSelector: "0x00000000",
  protocolData: "0x",
};

const logger = pino({ name: "Order Generator" });

class OrderGenerator {
  async generateSignedOrder(chainId: number): Promise<SignedOrder> {
    // generate random account
    const userAccount = this.generateRandomAccount();
    // generate random token pair for a trade
    const { srcToken, destToken, amount, side } = this.getRandomTokenTrade(chainId);
    const isBuy = side === "BUY";
    const formattedAmount = ethers.formatUnits(amount, isBuy ? destToken.decimals : srcToken.decimals);
    logger.info(
      `Generating a ${side} order: ${isBuy ? "" : formattedAmount} ${srcToken.symbol} -> ${isBuy ? formattedAmount : ""} ${destToken.symbol} for user ${userAccount.address}`,
    );
    // get pricing for the pair
    const deltaPrice = await deltaAPI.getPrices({
      chainId,
      srcToken: srcToken.address,
      destToken: destToken.address,
      srcDecimals: srcToken.decimals,
      destDecimals: destToken.decimals,
      amount,
      side,
    });
    // get the order to sign
    const { toSign } = await deltaAPI.buildOrder({
      price: deltaPrice,
      owner: userAccount.address,
      chainId,
      side,
      bridge: EMPTY_BRIDGE,
    });
    // sign the order
    const signature = await userAccount.signTypedData(toSign.domain, toSign.types, toSign.value);
    // compact the signature
    const compactSignature = Signature.from(signature).compactSerialized;
    // return the signature with the order
    return {
      order: toSign.value,
      signature: compactSignature,
      bridgeOverride: EMPTY_BRIDGE_OVERRIDE,
      cosignature: "0x",
      chainId,
    };
  }

  private generateRandomAccount(): HDNodeWallet {
    return Wallet.createRandom();
  }

  private getRandomTokenTrade(chainId: number): {
    srcToken: Token;
    destToken: Token;
    amount: string;
    side: SwapSide;
  } {
    // generate a random side for the trade
    const side = Math.random() < 0.5 ? "SELL" : "BUY";
    const chainConfig = (tokens as ChainTokensConfig)[chainId];
    // revert if there is no tokens for the chain
    if (!chainConfig) {
      const message = `Missing token config for chain ${chainId}!`;
      logger.error(message);
      throw new Error(message);
    }
    // get tokens from the config
    const tokenAddresses = Object.keys(chainConfig);
    // revert if there is not enough tokens
    if (tokenAddresses.length < 2) {
      const message = `Not enough tokens to generate a trade on chain ${chainId}!`;
      logger.error(message);
      throw new Error(message);
    }
    // get a random token as source token
    const srcTokenAddress = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];
    // get a random token as destination token, making sure it is not the same as source
    let destTokenAddress = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];
    // generate new until its unique
    while (srcTokenAddress === destTokenAddress) {
      destTokenAddress = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)];
    }
    // get the tokens
    const srcToken = chainConfig[srcTokenAddress];
    const destToken = chainConfig[destTokenAddress];

    // for SELL orders, amount represents the amount of source token to spend
    // for BUY orders, amount represents the amount of destination token to receive
    const amountToken = side === "SELL" ? srcToken : destToken;
    // generate the amount
    const { min, max } = amountToken.amounts;
    // get the range
    const amountsDiff = BigInt(max) - BigInt(min);
    // choose a random value in range
    const percent = Math.floor(Math.random() * 100);
    const randomValue = (amountsDiff * BigInt(percent)) / 100n;
    // apply the value to get the amount
    const amount = BigInt(min) + randomValue;

    return {
      srcToken,
      destToken,
      amount: amount.toString(),
      side,
    };
  }
}

export const orderGenerator = new OrderGenerator();
