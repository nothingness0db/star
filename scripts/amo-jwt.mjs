import { createHmac, randomUUID } from "node:crypto";

export const TOKEN_TTL_SECONDS = 300;

export function makeJwt(issuer, secret, now) {
  const issuedAt = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: issuer,
    jti: randomUUID(),
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS
  };
  const encode = function (value) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}
