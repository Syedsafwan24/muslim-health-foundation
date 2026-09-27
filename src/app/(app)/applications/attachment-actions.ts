"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AttachmentType } from "@prisma/client";
import { action, UserError, type ActionResult } from "@/lib/action";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/permissions";
import { requireViewContext, UnauthenticatedError } from "@/lib/auth/context";
import { sha256 } from "@/lib/crypto";
import { putObject } from "@/lib/storage";
import { getSettings } from "@/lib/settings";
import { ATTACHMENT_TYPE } from "@/lib/labels";
import { id } from "@/lib/validators";

const MAX_EDGE = 2500;

/** Identify the file by its bytes, not by the name or the browser's claimed type. */
function sniff(buf: Buffer): "pdf" | "jpeg" | "png" | "webp" | "heic" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(buf.subarray(8, 12).toString("latin1"))) return "heic";
  return null;
}

const pdfPages = (buf: Buffer) => Math.max(1, (buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length);

/**
 * Images: auto-rotate, downscale to 2500px, re-encode. Re-encoding drops all metadata including
 * EXIF GPS (sharp strips metadata unless asked to keep it). HEIC is converted to JPEG.
 */
async function processImage(buf: Buffer, kind: "jpeg" | "png" | "webp" | "heic") {
  const img = sharp(buf, { failOn: "error" }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
  if (kind === "png") return { body: await img.png().toBuffer(), mime: "image/png", ext: "png" };
  if (kind === "webp") return { body: await img.webp({ quality: 85 }).toBuffer(), mime: "image/webp", ext: "webp" };
  return { body: await img.jpeg({ quality: 85 }).toBuffer(), mime: "image/jpeg", ext: "jpg" };
}

/** Upload one or more files of one type to a case. FormData: applicationId, type, containsIdentity, files[]. */
export async function uploadAttachments(form: FormData): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireViewContext();
    assertPermission(ctx, "attachments.write");
    if (ctx.meetingMode) throw new UserError("Documents cannot be uploaded while identities are hidden.");
    const applicationId = String(form.get("applicationId") ?? "");
    const type = String(form.get("type") ?? "") as AttachmentType;
    if (!(type in ATTACHMENT_TYPE)) throw new UserError("Choose what kind of document this is.");
    const containsIdentity = form.get("containsIdentity") !== "false";
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new UserError("Choose at least one file.");

    const app = await prisma.application.findFirst({ where: { id: applicationId }, select: { id: true, caseNo: true, status: true, _count: { select: { attachments: { where: { deletedAt: null } } } } } });
    if (!app) throw new UserError("That case no longer exists.");
    if (app.status === "CLOSED") throw new UserError(`Case ${app.caseNo} is closed. Reopen it to add documents.`);
    const s = await getSettings(["documents.maxFileMb", "documents.maxFilesPerCase"]);
    if (app._count.attachments + files.length > s["documents.maxFilesPerCase"]) {
      throw new UserError(`A case can hold ${s["documents.maxFilesPerCase"]} files. Remove some before adding more.`);
    }

    const prepared = [];
    for (const f of files) {
      if (f.size > s["documents.maxFileMb"] * 1024 * 1024) throw new UserError(`Each file must be under ${s["documents.maxFileMb"]} MB. One of the files is larger.`);
      const raw = Buffer.from(await f.arrayBuffer());
      const kind = sniff(raw);
      if (!kind) throw new UserError("Only PDF, JPG, PNG, HEIC and WebP files can be uploaded.");
      let out: { body: Buffer; mime: string; ext: string; pages: number };
      if (kind === "pdf") out = { body: raw, mime: "application/pdf", ext: "pdf", pages: pdfPages(raw) };
      else {
        try {
          out = { ...(await processImage(raw, kind)), pages: 1 };
        } catch {
          throw new UserError(kind === "heic" ? "This HEIC photo could not be converted. Save it as JPG on the phone and upload again." : "One of the images could not be read. Check the file and try again.");
        }
      }
      prepared.push({ ...out, originalName: f.name.slice(0, 200) });
    }

    // Upload first, then record. An object with no row is unreachable (keys are random).
    const rows: ((typeof prepared)[number] & { key: string })[] = [];
    for (const p of prepared) {
      const key = `applications/${app.id}/${randomUUID()}.${p.ext}`;
      await putObject(key, p.body, p.mime);
      rows.push({ ...p, key });
    }
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const a = await tx.attachment.create({
          data: {
            type, storageKey: r.key, originalName: r.originalName, mimeType: r.mime, sizeBytes: r.body.length,
            checksumSha256: sha256(r.body), pageCount: r.pages, containsIdentity, applicationId: app.id, uploadedById: ctx.userId,
          },
        });
        await audit(tx, { actorId: ctx.userId, action: "CREATE", entity: "Attachment", entityId: a.id, summary: `Uploaded ${ATTACHMENT_TYPE[type].toLowerCase()} to case ${app.caseNo}` });
      }
    });
    revalidatePath(`/applications/${app.id}`);
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof ForbiddenError || e instanceof UnauthenticatedError) return { ok: false, error: e.message };
    console.error("[upload]", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "The upload failed and nothing was saved. Check the connection and try again." };
  }
}

export const deleteAttachment = action("attachments.write", z.object({ id }), async ({ id }, { ctx, tx, audit }) => {
  if (ctx.meetingMode) throw new UserError("Documents cannot be changed while identities are hidden.");
  const a = await tx.attachment.findFirst({ where: { id }, include: { application: { select: { id: true, caseNo: true, status: true } } } });
  if (!a) throw new UserError("That document has already been removed.");
  if (a.application && ["PAID", "CLOSED"].includes(a.application.status)) throw new UserError("Documents on a paid or closed case are kept as the record.");
  await tx.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "DELETE", entity: "Attachment", entityId: id, summary: `Removed ${ATTACHMENT_TYPE[a.type].toLowerCase()} from case ${a.application?.caseNo ?? ""}` });
  if (a.applicationId) revalidatePath(`/applications/${a.applicationId}`);
  return { id };
});

export const verifyAttachment = action("attachments.write", z.object({ id, verified: z.boolean() }), async ({ id, verified }, { ctx, tx, audit }) => {
  const a = await tx.attachment.findFirst({ where: { id }, include: { application: { select: { caseNo: true } } } });
  if (!a) throw new UserError("That document no longer exists.");
  await tx.attachment.update({ where: { id }, data: verified ? { verifiedAt: new Date(), verifiedById: ctx.userId } : { verifiedAt: null, verifiedById: null } });
  await audit({ action: "UPDATE", entity: "Attachment", entityId: id, summary: `${verified ? "Verified" : "Unverified"} ${ATTACHMENT_TYPE[a.type].toLowerCase()} on case ${a.application?.caseNo ?? ""}` });
  if (a.applicationId) revalidatePath(`/applications/${a.applicationId}`);
  return { verified };
});
