import { expect, test } from "bun:test";

const ACCESS_TOKEN = "test-token";

// Set before importing the server: it reads the token once at load time
Bun.env.ACCESS_TOKEN = ACCESS_TOKEN;
const { default: server } = await import("../src/index.ts");

test("rejects_request_without_token", async () => {
  const request = new Request("http://localhost/generate", { method: "POST" });

  const response = await server.fetch(request);

  expect(response.status).toBe(401);
});

test("rejects_request_with_wrong_token", async () => {
  const request = postWithToken("/generate", "wrong-token-of-another-length");

  const response = await server.fetch(request);

  expect(response.status).toBe(401);
});

test("passes_request_with_right_token_to_its_route", async () => {
  const request = postWithToken("/generate", ACCESS_TOKEN);

  const response = await server.fetch(request);

  // The generate module rejects the empty body with 400, so the request got past the token check and the router
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Body must be JSON" });
});

test("answers_404_for_unknown_route", async () => {
  const request = postWithToken("/unknown", ACCESS_TOKEN);

  const response = await server.fetch(request);

  expect(response.status).toBe(404);
});

test("refuses_to_start_with_empty_token", () => {
  const serverProcess = Bun.spawnSync({
    cmd: ["bun", `${import.meta.dir}/../src/index.ts`],
    env: { ...Bun.env, ACCESS_TOKEN: "" },
  });

  expect(serverProcess.exitCode).not.toBe(0);
  expect(serverProcess.stderr.toString()).toContain("ACCESS_TOKEN is not set");
});

function postWithToken(path: string, token: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
