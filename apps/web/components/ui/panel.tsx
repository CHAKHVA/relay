import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-xl border border-line bg-surface', className)} {...props} />;
}

export function PanelHeader({ title, action, description, className }: { title: React.ReactNode; action?: React.ReactNode; description?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
