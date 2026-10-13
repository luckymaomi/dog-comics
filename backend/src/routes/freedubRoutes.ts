import { Router } from "express";
import type { ServiceContainer } from "../services/container";
import { success } from "../response";
import { asyncRoute, bodyRecord } from "./http";
import { readString } from "../types/core";

export function freedubRoutes(
  services: Pick<ServiceContainer, "freedub">,
): Router {
  const router = Router();

  router.get(
    "/freedub/options",
    asyncRoute(async (_req, res) => {
      success(res, await services.freedub.options());
    }),
  );

  router.post(
    "/freedub/synthesize",
    asyncRoute(async (req, res) => {
      const body = bodyRecord(req);
      success(
        res,
        await services.freedub.synthesize({
          text: readString(body.text) ?? "",
          role: readString(body.role),
          style: readString(body.style),
        }),
      );
    }),
  );

  return router;
}
