import type { TableStatus } from '@/lib/catalog';

const STYLES: Record<TableStatus, string> = {
  STABLE:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
  DEMO: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
};

export function StatusBadge({ status }: { status: TableStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ring-inset ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
