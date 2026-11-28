import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { makeJwt, TOKEN_TTL_SECONDS } from "./amo-jwt.mjs";

function decode(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

test("AMO JWT 头部、签发时间与 5 分钟有效期正确", function () {
  const token = makeJwt("issuer@example", "secret-value", 1000);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  assert.deepEqual(decode(parts[0]), { alg: "HS256", typ: "JWT" });
  const payload = decode(parts[1]);
  assert.equal(payload.iss, "issuer@example");
  assert.equal(payload.iat, 1000);
  assert.equal(payload.exp, 1000 + TOKEN_TTL_SECONDS);
  assert.equal(typeof payload.jti, "string");
  assert.ok(payload.jti.length > 0);
});

test("AMO JWT 签名可用 secret 验证", function () {
  const token = makeJwt("issuer@example", "secret-value", 1000);
  const parts = token.split(".");
  const expected = createHmac("sha256", "secret-value")
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  assert.equal(parts[2], expected);
  const wrong = createHmac("sha256", "other-secret")
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  assert.notEqual(parts[2], wrong);
});

test("每次调用都生成新 token（jti 不同），避免长校验期间 token 过期", function () {
  const first = makeJwt("issuer@example", "secret-value", 1000);
  const second = makeJwt("issuer@example", "secret-value", 1000);
  assert.notEqual(first, second);
  assert.notEqual(decode(first.split(".")[1]).jti, decode(second.split(".")[1]).jti);
});
