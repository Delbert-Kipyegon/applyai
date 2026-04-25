import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";

export const DEVICE_COOKIE = "boltiply_device_id";

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function getRequestIdentity() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const existingDeviceId = cookieStore.get(DEVICE_COOKIE)?.value;
  const deviceId = existingDeviceId || randomUUID();
  const userAgent = headerStore.get("user-agent") || "unknown";
  const forwardedFor = headerStore.get("x-forwarded-for") || "";
  const realIp = headerStore.get("x-real-ip") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || realIp || "unknown";

  return {
    deviceId,
    deviceHash: hashValue(deviceId),
    hasDeviceCookie: Boolean(existingDeviceId),
    ipHash: hashValue(ip),
    userAgent,
    userAgentHash: hashValue(userAgent),
  };
}
