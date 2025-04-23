import type { Call } from "@/api/rpc/rpcCallModel";
import DELTA_ABI from "@/common/abi/delta.abi.json";
import { env } from "@/common/utils/envConfig";
import { type StateOverride, TenderlySimulator } from "@/lib/tenderly";
import axios from "axios";
import { Interface, Transaction, ethers } from "ethers";
import { pino } from "pino";

const logger = pino({ name: "RPC Service" });

const DELTA_INTERFACE = Interface.from(DELTA_ABI);
const PORTIKUS_ADDRESS = "0x0007005729e310000c6003402d8a0fb700da0c00";
const DELTA_ADDRESS = "0x0000000000bbf5c5fd284e657f01bd000933c96d";

export class RpcService {
  async process(call: Call) {
    try {
      // simulate `eth_sendRawTransaction` with tenderly
      // override state for `eth_call` and `eth_estimateGas`
      // for everything else, just forward to actual RPC
      switch (call.method) {
        case "eth_sendRawTransaction": {
          const simulator = TenderlySimulator.getInstance();
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
          // add overrides
          const stateOverride: StateOverride = {};
          await simulator.addTokenBalanceOverride(stateOverride, chainId, srcToken, owner, fundAmount);
          await simulator.addAllowanceOverride(stateOverride, chainId, srcToken, owner, DELTA_ADDRESS, fundAmount);
          simulator.addAgentRegistryOverride(stateOverride, PORTIKUS_ADDRESS, agentAddress);
          // build simulation transaction request
          const simulationRequest = {
            to: transaction.to,
            from: transaction.from,
            data: transaction.data,
            chainId: Number(transaction.chainId),
            stateOverride,
          };

          const simulation = await simulator.simulateTransaction(simulationRequest);

          logger.info(`Simulated transaction for ${call.method}: ${simulator.getSimulationUrl(simulation)}`);

          return {
            jsonrpc: call.jsonrpc,
            id: call.id,
            result: transaction.hash,
          };
        }
        case "eth_estimateGas": {
          const simulator = TenderlySimulator.getInstance();
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
          // add overrides
          const stateOverride: StateOverride = {};
          await simulator.addTokenBalanceOverride(stateOverride, chainId, srcToken, owner, fundAmount);
          await simulator.addAllowanceOverride(stateOverride, chainId, srcToken, owner, DELTA_ADDRESS, fundAmount);
          simulator.addAgentRegistryOverride(stateOverride, PORTIKUS_ADDRESS, agentAddress);
          // build simulation transaction request
          const simulationRequest = {
            to: to,
            from: from,
            data: data,
            chainId: chainId,
            stateOverride,
          };

          const simulation = await TenderlySimulator.getInstance().simulateTransaction(simulationRequest);

          logger.info(`Simulated transaction for ${call.method}: ${simulator.getSimulationUrl(simulation)}`);

          return {
            jsonrpc: call.jsonrpc,
            id: call.id,
            result: `0x${BigInt(simulation.gas_used).toString(16)}`,
          };
        }
        default:
          return this.forwardToRPC(call);
      }
    } catch (e) {
      logger.error(`Error processing the PRC call. Call: ${JSON.stringify(call)}, error: ${e}`);
      return {
        jsonrpc: call.jsonrpc,
        id: call.id,
        error: {
          code: -32603, // Internal error
          message: "Rpc call failed",
        },
      };
    }
  }

  decodeRawTransaction(rawTx: string): Transaction {
    return Transaction.from(rawTx);
  }

  decodeSettlementTransactionData(data: string) {
    const [orderWithSig, executorData, executor] = DELTA_INTERFACE.decodeFunctionData("swapSettle", data);
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
