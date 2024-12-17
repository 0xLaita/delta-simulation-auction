import express, { type Router } from "express";

import { userController } from "./agentController";

export const agentRouter: Router = express.Router();

agentRouter.post("/bid", userController.bid);
agentRouter.post("/execute", userController.execute);
