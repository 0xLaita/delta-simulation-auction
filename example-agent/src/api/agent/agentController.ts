import type { Request, RequestHandler, Response } from "express";

import { userService } from "@/api/agent/agentService";
import type { QuoteRequest } from "@/common/types";

class AgentController {
  public bid: RequestHandler = async (req: Request, res: Response) => {
    const bid = await userService.bid(req.body);
    return res.json(bid);
  };

  public quote: RequestHandler<QuoteRequest> = async (req: Request<QuoteRequest>, res: Response) => {
    const quote = await userService.quote(req.params);
    return res.json(quote);
  };
}

export const userController = new AgentController();
