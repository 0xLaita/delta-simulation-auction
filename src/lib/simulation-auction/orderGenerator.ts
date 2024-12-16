import type { DeltaOrder, Token } from "@/common/types";
import { deltaAPI } from "@/lib/delta-api/deltaAPI";
import { type HDNodeWallet, Signature, Wallet } from "ethers";

interface SignedOrder {
  order: DeltaOrder;
  signature: string;
  chainId: number;
}

class OrderGenerator {
  async generateSignedOrder(chainId: number): Promise<SignedOrder> {
    // generate random account
    const userAccount = this.generateRandomAccount();
    // generate random token pair for a trade
    const { srcToken, destToken, amount } = this.getRandomTokenTrade(chainId);
    // get pricing for the pair
    const deltaPrice = await deltaAPI.getPrices({
      chainId,
      srcToken: srcToken.address,
      destToken: destToken.address,
      srcDecimals: srcToken.decimals,
      destDecimals: destToken.decimals,
      amount,
      side: "SELL",
    });
    // get the order to sign
    const { toSign } = await deltaAPI.buildOrder({
      price: deltaPrice,
      owner: userAccount.address,
      chainId,
    });
    // sign the order
    const signature = await userAccount.signTypedData(toSign.domain, toSign.types, toSign.value);
    // compact the signature
    const compactSignature = Signature.from(signature).compactSerialized;
    // return the signature with the order
    return {
      order: toSign.value,
      signature: compactSignature,
      chainId,
    };
  }

  private generateRandomAccount(): HDNodeWallet {
    return Wallet.createRandom();
  }

  private getRandomTokenTrade(chainId: number): { srcToken: Token; destToken: Token; amount: string } {
    // todo: return from json config
    return {
      srcToken: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
      destToken: {
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
      },
      amount: "100000000", // todo: randomize
    };
  }
}

export const orderGenerator = new OrderGenerator();
