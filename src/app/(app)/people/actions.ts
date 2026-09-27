"use server";

import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { savePerson } from "@/lib/db/writes";
import { mergeSchema, personSchema, watchSchema } from "@/lib/validators";

export const updatePerson = action("people.write", personSchema, async (input, { ctx, tx, audit }) => {
  if (ctx.meetingMode) throw new UserError("People cannot be edited while identities are hidden.");
  if (!input.personId) throw new UserError("Register new people from the application form.");
  const r = await savePerson(tx, input, audit);
  revalidatePath(`/people/${r.id}`);
  return r;
});

export const setWatchFlag = action("people.write", watchSchema, async ({ personId, watchFlag, watchNote }, { ctx, tx, audit }) => {
  if (ctx.meetingMode) throw new UserError("People cannot be edited while identities are hidden.");
  const p = await tx.person.findFirst({ where: { id: personId } });
  if (!p) throw new UserError("That person no longer exists.");
  if (watchFlag && !watchNote) throw new UserError("Say why this person should be looked at closely.");
  await tx.person.update({ where: { id: personId }, data: { watchFlag, watchNote: watchFlag ? watchNote : null } });
  await audit({ action: "UPDATE", entity: "Person", entityId: personId, summary: `${watchFlag ? "Set" : "Cleared"} watch flag on ${p.personCode}` });
  revalidatePath(`/people/${personId}`);
  return { watchFlag };
});

/** Repoint every case and document to the kept record, then soft-delete the duplicate. */
export const mergePersons = action("people.merge", mergeSchema, async ({ keepId, mergeId, reason }, { ctx, tx, audit }) => {
  if (ctx.meetingMode) throw new UserError("People cannot be merged while identities are hidden.");
  if (keepId === mergeId) throw new UserError("Choose two different people to merge.");
  const [keep, merge] = await Promise.all([tx.person.findFirst({ where: { id: keepId } }), tx.person.findFirst({ where: { id: mergeId } })]);
  if (!keep || !merge) throw new UserError("One of those people no longer exists.");
  const [asApplicant, asPatient, files] = await Promise.all([
    tx.application.updateMany({ where: { applicantId: mergeId }, data: { applicantId: keepId } }),
    tx.application.updateMany({ where: { patientId: mergeId }, data: { patientId: keepId } }),
    tx.attachment.updateMany({ where: { personId: mergeId }, data: { personId: keepId } }),
  ]);
  await tx.person.update({ where: { id: mergeId }, data: { deletedAt: new Date(), notes: `Merged into ${keep.personCode}` } });
  await audit({
    action: "UPDATE", entity: "Person", entityId: keepId, reason,
    summary: `Merged ${merge.personCode} into ${keep.personCode} (${asApplicant.count + asPatient.count} case links, ${files.count} files)`,
    after: { kept: keep.personCode, merged: merge.personCode },
  });
  await audit({ action: "DELETE", entity: "Person", entityId: mergeId, summary: `Merged ${merge.personCode} into ${keep.personCode}`, reason });
  revalidatePath(`/people/${keepId}`);
  return { keepId };
});
