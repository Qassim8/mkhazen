import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";

interface BackLinkProps {
  href: string;
  label: string;
}

export default function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
    >
      <LuArrowRight className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
