import { expect, it } from "vitest";
import { personSchema } from "@/lib/validators";

it("accepts common Indian mobile formats and stores 10 digits", () => {
  const m = (mobile: string) => personSchema.safeParse({ fullName: "Test Person", mobile });
  for (const v of ["9876543210", "09876543210", "919876543210", "+91 98765 43210", "098765-43210"]) {
    const r = m(v);
    expect(r.success && r.data.mobile).toBe("9876543210");
  }
  expect(m("08431821788").success && m("08431821788").data?.mobile).toBe("8431821788");
  expect(m("12345").success).toBe(false);
});
