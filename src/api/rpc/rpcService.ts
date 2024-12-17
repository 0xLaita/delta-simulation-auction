import type { Call } from "@/api/rpc/rpcCallModel";
import DELTA_ABI from "@/common/abi/delta.abi.json";
import { env } from "@/common/utils/envConfig";
import { Tenderly } from "@/lib/tenderly";
import { stateOverrideHelpers } from "@/lib/tenderly/stateOverrideHelpers";
import axios from "axios";
import { Interface, Transaction, ethers } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "RPC Service" });

const deltaInterface = Interface.from(DELTA_ABI);
const portikusAddress = "0x0007005729e310000c6003402d8a0fb700da0c00";
const deltaAddress = "0x0000000000bbf5c5fd284e657f01bd000933c96d";

export class RpcService {
  async process(call: Call) {
    // simulate `eth_sendRawTransaction` with tenderly
    // override state for `eth_call` and `eth_estimateGas`
    // for everything else, just forward to actual RPC
    switch (call.method) {
      case "eth_sendRawTransaction": {
        // decode the transaction data
        const transaction = this.decodeRawTransaction(call.params[0]);
        const chainId = Number(transaction.chainId);
        // decode the settlement data
        const { orderWithSig } = this.decodeSettlementTransactionData(transaction.data);
        // get values needed for state overrides
        const agentAddress = transaction.from!; // needed for overriding agent registry
        const { srcToken, srcAmount, owner } = orderWithSig.order; // needed for overriding balance and allowance
        // get amount to set balance and allowance to
        const fundAmount = BigInt(srcAmount) * 2n;
        const funcAmountEncoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [fundAmount]);
        // get token state slots to override
        const tokenSlots = stateOverrideHelpers.getTokenBalanceAllowanceSlots(chainId, srcToken);
        const balanceSlot = stateOverrideHelpers.calculateAddressBalanceSlot(tokenSlots.balanceSlot, owner);
        const allowanceSlot = stateOverrideHelpers.calculateAddressAllowanceSlot(
          tokenSlots.allowanceSlot,
          owner,
          deltaAddress,
        );
        // get agent registry slot to override
        const agentRegistrySlot = stateOverrideHelpers.calculateAgentRegistrySlot(agentAddress);
        // build simulation transaction request
        const simulationRequest = {
          to: transaction.to,
          from: transaction.from,
          data: transaction.data,
          chainId: Number(transaction.chainId),
          stateOverride: {
            [srcToken]: {
              storage: {
                [balanceSlot]: funcAmountEncoded,
                [allowanceSlot]: funcAmountEncoded,
              },
            },
            [portikusAddress]: {
              storage: {
                [agentRegistrySlot]: ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]),
              },
            },
          },
        };

        await Tenderly.getInstance().simulateTransaction(simulationRequest);

        return {
          jsonrpc: call.jsonrpc,
          id: call.id,
          result: transaction.hash,
        };
      }
      case "eth_estimateGas": {
        // decode the transaction data
        const { from, to, data, value } = call.params[0];
        const chainId = Number(env.CHAIN_ID);
        // decode the settlement data
        const { orderWithSig } = this.decodeSettlementTransactionData(data);
        // get values needed for state overrides
        const agentAddress = from; // needed for overriding agent registry
        const { srcToken, srcAmount, owner } = orderWithSig.order; // needed for overriding balance and allowance
        // get amount to set balance and allowance to
        const fundAmount = BigInt(srcAmount) * 2n;
        const funcAmountEncoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [fundAmount]);
        // get token state slots to override
        const tokenSlots = stateOverrideHelpers.getTokenBalanceAllowanceSlots(chainId, srcToken);
        const balanceSlot = stateOverrideHelpers.calculateAddressBalanceSlot(tokenSlots.balanceSlot, owner);
        const allowanceSlot = stateOverrideHelpers.calculateAddressAllowanceSlot(
          tokenSlots.allowanceSlot,
          owner,
          deltaAddress,
        );
        // get agent registry slot to override
        const agentRegistrySlot = stateOverrideHelpers.calculateAgentRegistrySlot(agentAddress);
        // build state override object
        // build simulation transaction request
        const simulationRequest = {
          to: to,
          from: from,
          data: data,
          chainId: chainId,
          stateOverride: {
            [srcToken]: {
              storage: {
                [balanceSlot]: funcAmountEncoded,
                [allowanceSlot]: funcAmountEncoded,
              },
            },
            [portikusAddress]: {
              storage: {
                [agentRegistrySlot]: ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]),
              },
            },
          },
        };
        const result = await Tenderly.getInstance().estimateTransaction(simulationRequest);

        return {
          jsonrpc: call.jsonrpc,
          id: call.id,
          result,
        };
      }
      default:
        return this.forwardToRPC(call);
    }
  }

  decodeRawTransaction(rawTx: string): Transaction {
    return Transaction.from(rawTx);
  }

  decodeSettlementTransactionData(data: string) {
    const [orderWithSig, executorData, executor] = deltaInterface.decodeFunctionData("swapSettle", data);
    const [order, signature] = orderWithSig;
    const [
      owner,
      beneficiary,
      srcToken,
      destToken,
      srcAmount,
      destAmount,
      expectedDestAmount,
      deadline,
      nonce,
      partnerAndFee,
      permit,
    ] = order;

    return {
      orderWithSig: {
        order: {
          owner,
          beneficiary,
          srcToken,
          destToken,
          srcAmount,
          destAmount,
          expectedDestAmount,
          deadline,
          nonce,
          partnerAndFee,
          permit,
        },
        signature,
      },
      executor,
      executorData,
    };
  }

  async forwardToRPC(call: Call) {
    const { data } = await axios.post(env.RPC_URL, call);

    return data;
  }
}

export const rpcService = new RpcService();
