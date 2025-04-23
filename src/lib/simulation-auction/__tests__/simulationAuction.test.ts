import { SimulationAuction } from "@/lib/simulation-auction/simulationAuction";
import { beforeAll, describe } from "vitest";

describe("SimulationAuction", () => {
  let simulationAuction: SimulationAuction;

  beforeAll(() => {
    simulationAuction = SimulationAuction.getInstance(1);
  });

  describe("generateAuction", () => {
    it("should generate auction", async () => {
      const auction = await simulationAuction.generateOrderWithSignature();

      // todo: assert
    });
  });

  describe.todo("simulateAuctionFlow", () => {
    it("should simulate auction flow", async () => {});
  });
});
