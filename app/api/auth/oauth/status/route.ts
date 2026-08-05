const configured = (names: string[]) => names.every(name => Boolean(process.env[name]));

export async function GET() {
  return Response.json({
    google: configured(["OAUTH_STATE_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    apple: configured(["OAUTH_STATE_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY_BASE64"]),
  });
}
