import type { Request, RequestHandler, Response } from "express";

import { rpcService } from "@/api/rpc/rpcService";

class RpcController {
  public process: RequestHandler = async (req: Request, res: Response) => {
    const response = await rpcService.process(req.body);

    return res.send(response);
  };
}

export const rpcController = new RpcController();
