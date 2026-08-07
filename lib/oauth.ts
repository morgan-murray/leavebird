import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createSession } from "./auth";
import { withTransaction } from "./db";

export type OAuthProvider = "google";

type Transaction = {
  provider: OAuthProvider;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
};

type Identity = {
  subject: string;
  email: string;
};

const TRANSACTION_MINUTES = 10;
const secureCookie = () => process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google";
}

export function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function oauthErrorMessage(code: string | null, provider: string | null) {
  const name = provider === "google" ? "Google" : "your provider";
  const messages: Record<string, string> = {
    cancelled: `Sign-in with ${name} was cancelled. You can try again or use your email and password.`,
    unavailable_email: `${name} did not provide a verified email address. Allow email sharing, or use email and password instead.`,
    account_conflict: `That ${name} identity cannot be linked automatically. Sign in another way or contact support.`,
    configuration: `${name} sign-in is not configured yet. Use email and password for now.`,
    expired: "That sign-in attempt expired. Please start again.",
    failed: `We could not complete sign-in with ${name}. Please try again.`,
  };
  return code ? messages[code] ?? messages.failed : "";
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new OAuthError("configuration", `${name} is not configured`);
  return value;
}

function cookieName(provider: OAuthProvider) {
  return `leavebird_oauth_${provider}`;
}

function baseUrl(request: Request) {
  return (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function callbackUrl(request: Request, provider: OAuthProvider) {
  return `${baseUrl(request)}/api/auth/oauth/${provider}/callback`;
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function signTransaction(transaction: Transaction) {
  const body = Buffer.from(JSON.stringify(transaction)).toString("base64url");
  const signature = createHmac("sha256", env("OAUTH_STATE_SECRET")).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function readTransaction(value: string | undefined, provider: OAuthProvider) {
  if (!value) throw new OAuthError("expired");
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new OAuthError("expired");
  const expected = createHmac("sha256", env("OAUTH_STATE_SECRET")).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new OAuthError("expired");
  const transaction = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Transaction;
  if (transaction.provider !== provider || transaction.expiresAt < Date.now()) throw new OAuthError("expired");
  return transaction;
}

function configuration() {
  return {
    clientId: env("GOOGLE_CLIENT_ID"),
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
  };
}

export async function beginOAuth(request: Request, provider: OAuthProvider) {
  try {
    const config = configuration();
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const transaction: Transaction = { provider, state, nonce, verifier, returnTo, expiresAt: Date.now() + TRANSACTION_MINUTES * 60_000 };
    const jar = await cookies();
    jar.set(cookieName(provider), signTransaction(transaction), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie(),
      path: "/api/auth/oauth",
      maxAge: TRANSACTION_MINUTES * 60,
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl(request, provider),
      response_type: "code",
      scope: "openid email",
      state,
      nonce,
    });
    params.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    params.set("code_challenge_method", "S256");
    params.set("prompt", "select_account");
    return Response.redirect(`${config.authorizationEndpoint}?${params}`, 302);
  } catch (error) {
    return redirectWithError(request, provider, error);
  }
}

async function exchangeCode(request: Request, provider: OAuthProvider, code: string, transaction: Transaction) {
  const config = configuration();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    redirect_uri: callbackUrl(request, provider),
  });
  params.set("client_secret", env("GOOGLE_CLIENT_SECRET"));
  params.set("code_verifier", transaction.verifier);
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const result = await response.json() as { id_token?: string; error?: string };
  if (!response.ok || !result.id_token) throw new OAuthError("failed", result.error);
  return result.id_token;
}

async function verifyIdentity(idToken: string, nonce: string): Promise<Identity> {
  const clientId = configuration().clientId;
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (payload.nonce !== nonce) throw new OAuthError("failed", "Nonce mismatch");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!email || !emailVerified || !payload.sub) throw new OAuthError("unavailable_email");
  return { subject: payload.sub, email };
}

async function findOrCreateUser(provider: OAuthProvider, identity: Identity) {
  return withTransaction(async client => {
    const linked = await client.query<{ user_id: string }>(
      "SELECT user_id FROM auth_identities WHERE provider = $1 AND provider_subject = $2",
      [provider, identity.subject],
    );
    if (linked.rows[0]) return linked.rows[0].user_id;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, NULL)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [identity.email],
    );
    const existing = inserted.rows[0] ? null : await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [identity.email],
    );
    const userId = inserted.rows[0]?.id ?? existing?.rows[0]?.id;
    if (!userId) throw new OAuthError("failed", "Could not resolve user");
    const existingProvider = await client.query<{ provider_subject: string }>(
      "SELECT provider_subject FROM auth_identities WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
    if (existingProvider.rows[0]?.provider_subject !== undefined && existingProvider.rows[0].provider_subject !== identity.subject) {
      throw new OAuthError("account_conflict");
    }
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, provider_subject) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [userId, provider, identity.subject, identity.email],
    );
    return userId;
  });
}

export async function completeOAuth(
  request: Request,
  provider: OAuthProvider,
  values: { code?: string | null; state?: string | null; error?: string | null },
) {
  try {
    if (values.error) throw new OAuthError(values.error === "access_denied" ? "cancelled" : "failed");
    const jar = await cookies();
    const transaction = readTransaction(jar.get(cookieName(provider))?.value, provider);
    jar.set(cookieName(provider), "", { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/api/auth/oauth", maxAge: 0 });
    if (!values.code || !values.state || values.state !== transaction.state) throw new OAuthError("expired");
    const idToken = await exchangeCode(request, provider, values.code, transaction);
    const identity = await verifyIdentity(idToken, transaction.nonce);
    const userId = await findOrCreateUser(provider, identity);
    await createSession(userId);
    return Response.redirect(new URL(transaction.returnTo, baseUrl(request)), 303);
  } catch (error) {
    return redirectWithError(request, provider, error);
  }
}

class OAuthError extends Error {
  constructor(public code: string, message?: string) {
    super(message || code);
  }
}

function redirectWithError(request: Request, provider: OAuthProvider, error: unknown) {
  const code = error instanceof OAuthError ? error.code : "failed";
  if (!(error instanceof OAuthError) || code === "failed") console.error("Google OAuth failed", error);
  const target = new URL("/", baseUrl(request));
  target.searchParams.set("auth_error", code);
  target.searchParams.set("provider", provider);
  return Response.redirect(target, 303);
}
