import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'border-line-strong bg-surface-2 text-muted',
      primary: 'border-transparent bg-primary-soft text-primary',
      dusk: 'border-transparent bg-dusk-soft text-dusk-ink',
      run: 'border-transparent bg-run-soft text-run',
      danger: 'border-transparent bg-danger-soft text-danger',
      outline: 'border-line-strong bg-transparent text-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
