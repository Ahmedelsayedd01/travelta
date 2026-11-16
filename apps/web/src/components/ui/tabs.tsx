'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = BaseTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return <BaseTabs.List className={cn('flex gap-1 border-b border-border', className)} {...props} />;
}

export function Tab({ className, ...props }: ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg data-active:border-primary data-active:text-primary',
        className as string,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel className={cn('pt-4', className as string)} {...props} />;
}
