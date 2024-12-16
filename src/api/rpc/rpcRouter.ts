import express, { type Router } from "express";

import { rpcController } from "./rpcController";

export const rpcRouter: Router = express.Router();

rpcRouter.post("/", rpcController.process);
