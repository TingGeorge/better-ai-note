import { timingSafeEqual } from "node:crypto";

import { generate } from "./generate/index.ts";
import { transcribe } from "./transcribe/index.ts";

type RouteHandler = (request: Request) => Response | Promise<Response>;

const accessToken = Bun.env.ACCESS_TOKEN;
if (!accessToken) {
  // Without a token, anyone who finds the server URL could spend the owner's API money
  throw new Error("ACCESS_TOKEN is not set. Copy .env.example to .env and fill it in.");
}

const expectedAuthorizationHash = sha256(`Bearer ${accessToken}`);

const routes: Record<string, RouteHandler> = {
  "POST /generate": generate,
  "POST /transcribe": transcribe,
};

// Bun starts an HTTP server from a default export that has `fetch`
export default {
  fetch(request: Request): Response | Promise<Response> {
    if (!hasValidToken(request)) {
      return Response.json({ error: "Missing or wrong access token" }, { status: 401 });
    }

    const { pathname } = new URL(request.url);
    const handler = routes[`${request.method} ${pathname}`];
    if (!handler) {
      return Response.json({ error: `No route for ${request.method} ${pathname}` }, { status: 404 });
    }

    return handler(request);
  },
};

function hasValidToken(request: Request): boolean {
  const authorization = request.headers.get("Authorization");
  if (authorization === null) {
    return false;
  }

  // timingSafeEqual throws on inputs of different length; hashing first makes them equal length
  return timingSafeEqual(sha256(authorization), expectedAuthorizationHash);
}

function sha256(text: string): Buffer {
  return new Bun.CryptoHasher("sha256").update(text).digest();
}
