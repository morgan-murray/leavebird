import { completeOAuth, isOAuthProvider } from "@/lib/oauth";

type Context = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: Context) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) return Response.json({ error: "Unknown sign-in provider." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  return completeOAuth(request, provider, {
    code: params.get("code"),
    state: params.get("state"),
    error: params.get("error"),
  });
}
