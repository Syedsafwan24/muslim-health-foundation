import "server-only";
import { prisma, type DB, type Tx } from "@/lib/db";

// Setting keys and their defaults. Values are JSON in the Setting table.
export const SETTING_DEFAULTS = {
  "meetingMode.global": false,
  "reveal.minutes": 5,
  "org.name": "Muslim Health Foundation",
  "org.address": "Jamat Complex, 1st Floor, N.H.66, Near Noor Masjid, Bhatkal – 581 320",
  "org.phone": "",
  "org.email": "",
  "org.registrationNo": "",
  "org.80gNo": "",
  "documents.required": ["GOVT_ID", "MHF_APPLICATION_FORM", "HOSPITAL_LETTER", "HOSPITAL_BILL"] as string[],
  "documents.maxFileMb": 15,
  "documents.maxFilesPerCase": 40,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends readonly string[]
  ? string[]
  : (typeof SETTING_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof SETTING_DEFAULTS)[K] extends number
      ? number
      : string;

export async function getSetting<K extends SettingKey>(key: K, db: DB | Tx = prisma): Promise<SettingValue<K>> {
  const row = await db.setting.findUnique({ where: { key: key as string } });
  return (row?.value ?? SETTING_DEFAULTS[key]) as SettingValue<K>;
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const out = {} as Record<string, unknown>;
  for (const k of keys) out[k] = rows.find((r) => r.key === k)?.value ?? SETTING_DEFAULTS[k];
  return out as { [P in K]: SettingValue<P> };
}

export async function setSetting<K extends SettingKey>(db: DB | Tx, key: K, value: SettingValue<K>, userId: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value, updatedById: userId },
    update: { value, updatedById: userId },
  });
}
