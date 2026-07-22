import Link from 'next/link';
import { FiPlus } from 'react-icons/fi';

interface PageHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function PageHeader({ title, description, actionLabel, actionHref, onAction }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-300 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
      </div>
      {actionLabel ? (
        actionHref ? (
          <Link href={actionHref} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary-red)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--primary-red-hover)]">
            <FiPlus className="h-4 w-4" />
            {actionLabel}
          </Link>
        ) : (
          <button onClick={onAction} className="inline-flex items-center gap-2 rounded-full bg-[var(--primary-red)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--primary-red-hover)]">
            <FiPlus className="h-4 w-4" />
            {actionLabel}
          </button>
        )
      ) : null}
    </div>
  );
}
