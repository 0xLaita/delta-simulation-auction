import type { Request, RequestHandler, Response } from "express";

import { userService } from "@/api/agent/agentService";

class AgentController {
  public bid: RequestHandler = async (req: Request, res: Response) => {
    const { chainId, order, partner } = req.body;
    const bid = await userService.bid(chainId, order, partner);

    return res.json(bid);
  };

  public execute: RequestHandler = async (req: Request, res: Response) => {
    const { auction, solution } = req.body;
    const success = await userService.execute(auction, solution);

    return res.json({ success });
  };
}

export const userController = new AgentController();
