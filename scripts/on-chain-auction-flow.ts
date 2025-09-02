import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import { type DeltaOrder, OrderType, type SwapSide } from "../src/common/types";
import { env } from "../src/common/utils/envConfig";
import { deltaAPI } from "../src/lib/delta-api/deltaAPI";
import { HttpAgent } from "../src/lib/simulation-auction/httpAgent";

const USER_PK = env.USER_PK;

if (!USER_PK) {
  throw new Error('"USER_PK" env required!');
}

const chainId = 8453;
const DELTA_ADDRESS = "0x1b6c933C4A855C9F4Ad1AFBD05EB3f51dbB83CF8";
const userWallet = new ethers.Wallet(USER_PK);
const provider = new ethers.JsonRpcProvider(env.RPC_URL);

const srcToken = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  decimals: 6,
};

const destToken = {
  address: "0x4200000000000000000000000000000000000006", // WETH
  decimals: 18,
};

const readableAmount = "1";
const amount = ethers.parseUnits(readableAmount, srcToken.decimals).toString();

const getRandomSide = () => {
  return Math.random() < 0.5 ? "BUY" : "SELL";
};

const main = async () => {
  console.log("Running on chain auction flow with config:");
  console.log(`Chain: ${chainId}`);
  console.log(`User: ${userWallet.address}`);
  console.log(`Agent: ${env.AGENT_NAME} (${env.AGENT_ADDRESS}) at ${env.AGENT_URL}`);
  console.log(`Trade: ${readableAmount} ${srcToken.address} -> ${destToken.address}`);
  console.log();

  try {
    if (!(await runChecks())) {
      // terminate of checks fail
      return;
    }

    // generate a random side for the order
    const side = getRandomSide();
    // create the agent
    const agent = new HttpAgent(env.AGENT_NAME, env.AGENT_URL);
    // fetch prices and build the order for the pair
    const { order, signature } = await buildAndSignOrder(side);
    // generate id for the order
    const orderId = randomUUID();
    // get bid from the agent
    const bidResponse = await agent.bid({
      chainId,
      orders: [
        {
          orderId,
          srcToken: order.srcToken,
          destToken: order.destToken,
          srcAmount: order.srcAmount,
          destAmount: order.destAmount,
          side,
          partiallyFillable: false,
          type: OrderType.Market,
          metadata: {
            deltaGasOverhead: 250_000,
          },
        },
      ],
    });
    // return if no bid returned
    if (!bidResponse || !bidResponse.solutions || bidResponse.solutions.length === 0) {
      console.log("No bid was returned from the agent");
      return;
    }

    console.log("Received bid:\n");
    console.log(bidResponse);
    // validate order id
    if (bidResponse.solutions[0].orderId.toLowerCase() !== orderId.toLowerCase()) {
      console.log(
        `Order ids are not matching. Solution order id: ${bidResponse.solutions[0].orderId}, actual order id: ${orderId}`,
      );
      return;
    }
    // send execute request, skipping the auction
    const { success } = await agent.execute({
      chainId,
      orders: [
        {
          orderId,
          orderData: {
            owner: order.owner,
            beneficiary: order.beneficiary,
            srcToken: order.srcToken,
            destToken: order.destToken,
            srcAmount: order.srcAmount,
            destAmount: order.destAmount,
            expectedAmount: order.expectedAmount,
            nonce: order.nonce,
            deadline: order.deadline,
            permit: order.permit,
            partnerAndFee: order.partnerAndFee,
            kind: order.kind,
            metadata: order.metadata,
            bridge: order.bridge,
          },
          signature,
          side,
          value: "0",
          partiallyFillable: false,
          bridgeDataEncoded: "0x",
          solution: bidResponse.solutions[0],
        },
      ],
    });
    if (success) {
      console.log("Successfully sent execute request!");
    } else {
      console.log("No execute!");
    }
  } catch (e) {
    console.error("Error running on chain delta flow: ", e);
  }
};

const runChecks = async () => {
  // check if provider has correct chain id
  const network = await provider.getNetwork();
  if (network.chainId.toString() !== chainId.toString()) {
    console.error(`Error: RPC URL network (${network.chainId}) is different from config network (${chainId})`);
    return false;
  }
  // check if user has sufficient balance & allowance
  const erc20 = new ethers.Contract(
    srcToken.address,
    [
      "function allowance(address,address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
    ],
    provider,
  );
  const balance = await erc20.balanceOf(userWallet.address);
  if (balance < BigInt(amount)) {
    console.error(`User has insufficient balance: ${balance} < ${amount}`);
    return false;
  }
  const allowance = await erc20.allowance(userWallet.address, DELTA_ADDRESS);
  if (allowance < BigInt(amount)) {
    console.error(`User has insufficient allowance to Delta (${DELTA_ADDRESS}): ${allowance} < ${amount}`);
    return false;
  }

  return true;
};

const buildAndSignOrder = async (side: SwapSide): Promise<{ order: DeltaOrder; signature: string }> => {
  const price = await deltaAPI.getPrices({
    chainId,
    srcToken: srcToken.address,
    srcDecimals: srcToken.decimals,
    destToken: destToken.address,
    destDecimals: destToken.decimals,
    side,
    amount,
  });

  const { toSign } = await deltaAPI.buildOrder({
    owner: userWallet.address,
    chainId,
    price,
    slippage: 10_000, // 10% - adjust if needed
    side,
  });

  // change delta address
  toSign.domain.verifyingContract = DELTA_ADDRESS;

  const signature = ethers.Signature.from(
    await userWallet.signTypedData(toSign.domain, toSign.types, toSign.value),
  ).compactSerialized;

  return {
    order: toSign.value,
    signature,
  };
};

main();
