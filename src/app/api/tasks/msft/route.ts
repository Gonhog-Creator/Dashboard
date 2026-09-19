import { NextRequest } from "next/server";
import { z } from "zod";
import {
  disconnectMsft,
  msftConfigured,
  msftConnected,
  pollDeviceCode,
  startDeviceCode,
} from "@/lib/graph";

const actionSchema = z.object({
  action: z.enum(["start", "poll", "disconnect"]),
  deviceCode: z.string().optional(),
});

export async function GET() {
  return Response.json({
    configured: msftConfigured(),
    connected: await msftConnected(),
  });
}

export async function POST(req: NextRequest) {
  if (!msftConfigured())
    return Response.json(
      { error: "msft-not-configured", message: "Set MSFT_CLIENT_ID in .env" },
      { status: 503 }
    );

  const { action, deviceCode } = actionSchema.parse(await req.json());

  if (action === "start") {
    const session = await startDeviceCode();
    return Response.json(session);
  }
  if (action === "poll") {
    if (!deviceCode)
      return Response.json({ error: "deviceCode required" }, { status: 400 });
    return Response.json({ status: await pollDeviceCode(deviceCode) });
  }
  // disconnect
  await disconnectMsft();
  return Response.json({ ok: true });
}
