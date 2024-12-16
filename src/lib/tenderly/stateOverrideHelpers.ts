import { stateSlots } from "@/lib/tenderly/stateSlots";
import { ethers } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "State Override Helpers" });

const AGENT_REGISTRY_MAPPING_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000002";

class StateOverrideHelpers {
  getTokenBalanceAllowanceSlots(
    chainId: number,
    token: string,
  ): {
    balanceSlot: string;
    allowanceSlot: string;
  } {
    const chainConfig = stateSlots[chainId];

    if (!chainConfig) {
      logger.error(`No token slots config for chain ${chainId}`);
    }

    const tokenConfig = chainConfig[token.toLowerCase()];

    if (!tokenConfig) {
      logger.error(`No token slots config for token ${token} on chain ${chainId}`);
    }

    return tokenConfig;
  }

  calculateAddressBalanceSlot(balanceSlot: string, owner: string) {
    return ethers.keccak256(ethers.concat([ethers.zeroPadValue(owner, 32), balanceSlot]));
  }

  calculateAddressAllowanceSlot(allowanceSlot: string, owner: string, spender: string) {
    const slotHash = ethers.keccak256(
      ethers.concat([ethers.zeroPadValue(owner, 32), ethers.zeroPadBytes(allowanceSlot, 32)]),
    );

    return ethers.keccak256(ethers.concat([ethers.zeroPadValue(spender, 32), slotHash]));
  }

  calculateAgentRegistrySlot(agent: string) {
    return ethers.keccak256(ethers.concat([ethers.zeroPadValue(agent, 32), AGENT_REGISTRY_MAPPING_SLOT]));
  }
}

export const stateOverrideHelpers = new StateOverrideHelpers();
