import { env } from "@/common/utils/envConfig";
import { SimulationAuction } from "@/lib/simulation-auction/simulationAuction";
import { app, logger } from "@/server";

const server = app.listen(env.PORT, () => {
  const { NODE_ENV, HOST, PORT } = env;
  logger.info(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}`);
  SimulationAuction.getInstance(env.CHAIN_ID).start();
});

const onCloseSignal = () => {
  SimulationAuction.getInstance(env.CHAIN_ID).stop();
  logger.info("sigint received, shutting down");
  server.close(() => {
    logger.info("server closed");
    process.exit();
  });
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
