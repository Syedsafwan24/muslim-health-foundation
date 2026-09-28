"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import { diff } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { documentSettingsSchema, hospitalSchema, id, masterSchema, optText, userSchema } from "@/lib/validators";

// ─────────────────────────── meeting mode ───────────────────────────

/** The global switch. Affects every user on their next request. Exactly one audit row per toggle. */
export const setMeetingMode = action("meetingMode.toggle", z.object({ on: z.boolean() }), async ({ on }, { ctx, tx, audit }) => {
  const current = await getSetting("meetingMode.global", tx);
  if (current === on) throw new UserError(on ? "Identities are already hidden for everyone." : "Meeting mode is already off.");
  await setSetting(tx, "meetingMode.global", on, ctx.userId);
  await audit({ action: "MEETING_MODE_TOGGLE", entity: "Setting", entityId: "meetingMode.global", summary: on ? "Turned meeting mode on for everyone" : "Turned meeting mode off", before: { on: current }, after: { on } });
  revalidatePath("/", "layout");
  return { on };
});

export const setRevealMinutes = action("settings.write", z.object({ minutes: z.number().int().min(1).max(15) }), async ({ minutes }, { ctx, tx, audit }) => {
  const before = await getSetting("reveal.minutes", tx);
  await setSetting(tx, "reveal.minutes", minutes, ctx.userId);
  await audit({ action: "SETTING_CHANGE", entity: "Setting", entityId: "reveal.minutes", summary: `Reveal expiry set to ${minutes} minutes`, before: { minutes: before }, after: { minutes } });
  revalidatePath("/settings/privacy");
  return { minutes };
});

export const setForceMeetingMode = action("meetingMode.toggle", z.object({ userId: id, on: z.boolean() }), async ({ userId, on }, { tx, audit }) => {
  const u = await tx.user.findFirst({ where: { id: userId } });
  if (!u) throw new UserError("That account no longer exists.");
  await tx.user.update({ where: { id: userId }, data: { forceMeetingMode: on } });
  await audit({ action: "SETTING_CHANGE", entity: "User", entityId: userId, summary: `${on ? "Pinned" : "Unpinned"} meeting mode for ${u.name}` });
  revalidatePath("/settings/privacy");
  revalidatePath("/settings/users");
  return { on };
});

// ─────────────────────────── users ───────────────────────────

export const saveUser = action("users.manage", userSchema, async ({ id, newPassword, adminPassword, ...data }, { ctx, tx, audit }) => {
  if (!(await verifyPassword(ctx.userId, adminPassword))) throw new UserError("That password is not correct.");
  if (id === ctx.userId && (data.role !== "SUPER_ADMIN" || !data.isActive)) {
    throw new UserError("You cannot remove your own super admin access. Ask another super admin.");
  }
  const clash = await tx.user.findFirst({ where: { email: data.email, ...(id ? { id: { not: id } } : {}), deletedAt: undefined } });
  if (clash) throw new UserError("Another account already uses that email.");
  if (id) {
    const before = await tx.user.findFirst({ where: { id } });
    if (!before) throw new UserError("That account no longer exists.");
    await tx.user.update({
      where: { id },
      data: {
        ...data,
        // An admin-set password is temporary: the owner must replace it at next sign-in.
        ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10), failedLoginCount: 0, lockedUntil: null, mustChangePassword: id !== ctx.userId } : {}),
        // A reset or deactivation ends every open session of that account.
        ...(newPassword || (before.isActive && !data.isActive) ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    const d = diff(before as unknown as Record<string, unknown>, data);
    await audit({ action: "UPDATE", entity: "User", entityId: id, summary: `Updated account ${before.name}${newPassword ? " and reset its password" : ""}`, before: d.before, after: d.after });
  } else {
    if (!newPassword) throw new UserError("Set a starting password for the new account.");
    const u = await tx.user.create({ data: { ...data, passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: true } });
    await audit({ action: "CREATE", entity: "User", entityId: u.id, summary: `Created account ${u.name}`, after: { role: u.role } });
  }
  revalidatePath("/settings/users");
  return { ok: true };
});

// ─────────────────────────── organisation & documents ───────────────────────────

export const saveOrganisation = action(
  "settings.write",
  z.object({ name: z.string().trim().min(2).max(160), address: optText(300), phone: optText(40), email: optText(120), registrationNo: optText(60), eightyGNo: optText(60) }),
  async (v, { ctx, tx, audit }) => {
    const pairs = [
      ["org.name", v.name], ["org.address", v.address ?? ""], ["org.phone", v.phone ?? ""], ["org.email", v.email ?? ""],
      ["org.registrationNo", v.registrationNo ?? ""], ["org.80gNo", v.eightyGNo ?? ""],
    ] as const;
    for (const [k, val] of pairs) await setSetting(tx, k, val, ctx.userId);
    await audit({ action: "SETTING_CHANGE", entity: "Setting", entityId: "org", summary: "Updated organisation details" });
    revalidatePath("/settings");
    return { ok: true };
  },
);

export const saveDocumentSettings = action(
  "settings.write",
  documentSettingsSchema,
  async (v, { ctx, tx, audit }) => {
    const before = await getSetting("documents.required", tx);
    await setSetting(tx, "documents.required", v.required, ctx.userId);
    await setSetting(tx, "documents.maxFileMb", v.maxFileMb, ctx.userId);
    await setSetting(tx, "documents.maxFilesPerCase", v.maxFilesPerCase, ctx.userId);
    await audit({ action: "SETTING_CHANGE", entity: "Setting", entityId: "documents", summary: "Updated document rules", before: { required: before }, after: v });
    revalidatePath("/settings/documents");
    return { ok: true };
  },
);

// ─────────────────────────── masters ───────────────────────────

export const saveHospital = action("hospitals.write", hospitalSchema, async ({ id, ...data }, { tx, audit }) => {
  if (id) {
    const before = await tx.hospital.findFirst({ where: { id } });
    if (!before) throw new UserError("That hospital no longer exists.");
    await tx.hospital.update({ where: { id }, data });
    const d = diff(before as unknown as Record<string, unknown>, data);
    await audit({ action: "UPDATE", entity: "Hospital", entityId: id, summary: `Updated hospital ${data.name}`, before: d.before, after: d.after });
    revalidatePath(`/hospitals/${id}`);
    return { id, name: data.name };
  }
  const dupe = await tx.hospital.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, city: data.city } });
  if (dupe) throw new UserError(`${dupe.name}${dupe.city ? `, ${dupe.city}` : ""} is already in the list.`);
  const h = await tx.hospital.create({ data });
  await audit({ action: "CREATE", entity: "Hospital", entityId: h.id, summary: `Added hospital ${h.name}` });
  revalidatePath("/hospitals");
  return { id: h.id, name: h.name };
});

export const saveMaster = action("masters.write", masterSchema, async (input, { tx, audit }) => {
  const { kind, id, ...rest } = input;
  const entity = { area: "Area", bank: "Bank", category: "DiseaseCategory", disease: "Disease" }[kind];
  let rowId: string;
  switch (input.kind) {
    case "area": {
      const data = { name: input.name, taluk: input.taluk };
      rowId = id ? (await tx.area.update({ where: { id }, data })).id : (await tx.area.create({ data })).id;
      break;
    }
    case "bank": {
      const data = { name: input.name, branch: input.branch, accountLast4: input.accountLast4, isOwnAccount: input.isOwnAccount };
      rowId = id ? (await tx.bank.update({ where: { id }, data })).id : (await tx.bank.create({ data })).id;
      break;
    }
    case "category": {
      const data = { name: input.name, sortOrder: input.sortOrder ?? 0 };
      rowId = id ? (await tx.diseaseCategory.update({ where: { id }, data })).id : (await tx.diseaseCategory.create({ data })).id;
      break;
    }
    case "disease": {
      const data = { name: input.name, categoryId: input.categoryId, isChronic: input.isChronic };
      rowId = id ? (await tx.disease.update({ where: { id }, data })).id : (await tx.disease.create({ data })).id;
      break;
    }
  }
  await audit({ action: id ? "UPDATE" : "CREATE", entity, entityId: rowId, summary: `${id ? "Updated" : "Added"} ${entity.replace(/([A-Z])/g, " $1").trim().toLowerCase()} ${rest.name}` });
  revalidatePath("/settings/masters");
  return { id: rowId };
});

/** A master in use cannot be deleted — only unused rows are soft-deleted. */
export const deleteMaster = action("masters.write", z.object({ kind: z.enum(["area", "bank", "category", "disease"]), id }), async ({ kind, id }, { tx, audit }) => {
  const uses =
    kind === "area" ? await tx.person.count({ where: { areaId: id } })
    : kind === "bank" ? (await tx.payment.count({ where: { bankId: id } })) + (await tx.donation.count({ where: { bankId: id } }))
    : kind === "category" ? await tx.disease.count({ where: { categoryId: id } })
    : await tx.application.count({ where: { diseaseId: id } });
  if (uses) throw new UserError(`This is used by ${uses} record${uses === 1 ? "" : "s"}, so it cannot be removed.`);
  const now = new Date();
  const name =
    kind === "area" ? (await tx.area.update({ where: { id }, data: { deletedAt: now } })).name
    : kind === "bank" ? (await tx.bank.update({ where: { id }, data: { deletedAt: now } })).name
    : kind === "category" ? (await tx.diseaseCategory.update({ where: { id }, data: { deletedAt: now } })).name
    : (await tx.disease.update({ where: { id }, data: { deletedAt: now } })).name;
  await audit({ action: "DELETE", entity: kind, entityId: id, summary: `Removed ${kind} ${name}` });
  revalidatePath("/settings/masters");
  return { id };
});
