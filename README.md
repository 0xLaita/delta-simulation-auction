# Delta Simulation Auction

## Introduction

This repo helps agents test their solving capabilities for integrating into the Velora Delta protocol, or just experiment with the Agent API. Each round generates a synthetic order, asks your agent for a bid, wraps the returned `(target, callData)` into a `GenericSwapExecutor` `SwapData` payload, and simulates the resulting `swapSettle` / `buySettle` call on Tenderly so you can inspect the trace — no on-chain submission needed.

## Integration Steps

### Step 0: 🕵🏻 Implement your Agent

To play around with the auction, you'll need an agent that responds to `/bid`. See the Agent API documentation, or use the bundled [`example-agent`](./example-agent) as a starting point.

### Step 1: 🚀 Initial Setup

- Clone the repository: `git clone https://github.com/0xLaita/delta-simulation-auction.git`
- Navigate: `cd delta-simulation-auction`
- Install dependencies: `npm ci`

### Step 2: ⚙️ Environment Configuration

- Create `.env`: copy `.env.template` to `.env`
- Update `.env`: fill in the necessary environment variables (chain ID, Tenderly credentials, your agent's URL, etc.)

### Step 3: 🏃‍♂️ Running the Auction

- Development mode: `npm run dev`

### Step 4: 🤝 Settle some Orders!

If everything is wired up correctly, the auction will start generating orders and calling your agent's `/bid`. For each viable bid the simulator runs the settlement on Tenderly and logs the simulation URL.

## 👣 Next Steps

- When you're confident in your agent, reach out so we can proceed with the integration process and join our staging competition.

## 💬 Feedback and Contributions

We'd love to hear your feedback and suggestions for further improvements. Feel free to contact us!

🎉 Happy coding!
