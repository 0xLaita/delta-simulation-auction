import type { Request, RequestHandler, Response } from "express";

import { userService } from "@/api/agent/agentService";

class AgentController {
  public bid: RequestHandler = async (req: Request, res: Response) => {
    const bid = await userService.bid(req.body);

    return res.json(bid);
  };

  public execute: RequestHandler = async (req: Request, res: Response) => {
    const success = await userService.execute(req.body);

    return res.json({ success });
  };
}

export const userController = new AgentController();
