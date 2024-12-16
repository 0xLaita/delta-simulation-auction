import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Input Validation for 'POST /rpc' endpoint
export const ProcessRpcSchema = z.object({
  body: z.object({
    method: z.string(),
    params: z.array(z.any()), // todo: set correct types,
    id: z.number(),
    jsonrpc: z.string(),
  }),
});

export type Call = z.infer<typeof ProcessRpcSchema>["body"];
