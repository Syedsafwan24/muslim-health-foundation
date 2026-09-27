import { NextResponse } from "next/server";
import { requireViewContext } from "@/lib/auth/context";
import { authorizeFileAccess } from "@/lib/db/queries/shared";
import { signedGetUrl } from "@/lib/storage";

// Issues a 5-minute signed URL after a role + Meeting Mode check, and audits the access.
// Under Meeting Mode an identity-bearing file gets a 403 and no URL is ever written.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireViewContext();
  } catch {
    return new NextResponse("Sign in again to view this file.", { status: 401 });
  }
  const { id } = await params;
  const download = new URL(req.url).searchParams.get("download") === "1";
  const r = await authorizeFileAccess(ctx, id, download);
  if (!r.ok) {
    return new NextResponse(r.status === 404 ? "This file no longer exists." : "This file is locked for you right now.", {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const url = await signedGetUrl(r.storageKey, { contentType: r.mimeType, download: download ? r.downloadName : undefined });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store, private" } });
}
