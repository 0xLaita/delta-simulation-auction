import dotenv from "dotenv";
import { url, cleanEnv, host, num, port, str, testOnly } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ devDefault: testOnly("test"), choices: ["development", "production", "test"] }),
  HOST: host({ devDefault: testOnly("localhost") }),
  PORT: port({ devDefault: testOnly(3000) }),
  CORS_ORIGIN: str({ devDefault: testOnly("http://localhost:3000") }),
  COMMON_RATE_LIMIT_MAX_REQUESTS: num({ devDefault: testOnly(1000) }),
  COMMON_RATE_LIMIT_WINDOW_MS: num({ devDefault: testOnly(1000) }),
  CHAIN_ID: num(),
  AGENT_NAME: str(),
  AGENT_ADDRESS: str(),
  AGENT_URL: url(),
  USER_PK: str({ default: "" }),
  AUCTION_GENERATION_INTERVAL_MS: num({ default: 10_000 }),
  RPC_URL: str(),
  TENDERLY_ACCOUNT_SLUG: str(),
  TENDERLY_PROJECT_SLUG: str(),
  TENDERLY_ACCESS_TOKEN: str(),
});
