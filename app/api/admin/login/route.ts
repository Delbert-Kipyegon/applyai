import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, isAdminPasswordValid } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");

  if (!isAdminPasswordValid(password)) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), { status: 303 });
  }

  const session = await createAdminSession();
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });

  response.cookies.set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });

  return response;
}
