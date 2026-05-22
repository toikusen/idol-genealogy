import { onRequest as __api_timetree_events_ts_onRequest } from "/Users/seitumbp2025/idol-genealogy/functions/api/timetree-events.ts"
import { onRequest as ___middleware_ts_onRequest } from "/Users/seitumbp2025/idol-genealogy/functions/_middleware.ts"

export const routes = [
    {
      routePath: "/api/timetree-events",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_timetree_events_ts_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]