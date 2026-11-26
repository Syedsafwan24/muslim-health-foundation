import { LOGO_LETTERS } from "@/lib/logo";

/** The MHF seal. `inverse` (white disc, navy letters) for use on the navy sidebar. */
export function MhfLogo({ className, inverse }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <circle cx="50" cy="50" r="50" className={inverse ? "fill-white" : "fill-navy-700"} />
      <path d={LOGO_LETTERS} className={inverse ? "fill-navy-700" : "fill-white"} />
    </svg>
  );
}
