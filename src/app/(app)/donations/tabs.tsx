import Link from "next/link";

export function DonationTabs({ active, showFunds }: { active: "entries" | "donors"; showFunds: boolean }) {
  const tabs = [
    { id: "entries", label: "Entries", href: "/donations" },
    { id: "donors", label: "Donors", href: "/donations/donors" },
    ...(showFunds ? [{ id: "funds", label: "Funds", href: "/funds" }] : []),
  ];
  return (
    <nav aria-label="Donations" className="mb-4 flex gap-1 border-b border-rule">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={active === t.id ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-ui font-medium ${active === t.id ? "border-navy-700 text-navy-900" : "border-transparent text-slate-body hover:text-navy-900"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
