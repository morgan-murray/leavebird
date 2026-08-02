import { currentUser } from "@/lib/auth";

export async function GET() {
  const user = await currentUser();
  return Response.json({ user });
}
