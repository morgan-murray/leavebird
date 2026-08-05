import { beginOAuth, isOAuthProvider } from "@/lib/oauth";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) return Response.json({ error: "Unknown sign-in provider." }, { status: 404 });
  return beginOAuth(request, provider);
}
