import type { Request, RequestHandler, Response } from "express";

import { rpcService } from "@/api/rpc/rpcService";

class RpcController {
  public process: RequestHandler = async (_req: Request, res: Response) => {
    const response = await rpcService.process(_req.body);

    return res.send(response);
  };
}

export const rpcController = new RpcController();
