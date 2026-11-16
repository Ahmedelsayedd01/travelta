'use client';

import type { ReactNode } from 'react';
import { DemoPanel } from '@/features/demo/demo-panel';
import { MockApiGate, QueryProvider, SyncBridge } from './api-provider';
import { ThemeProvider } from './theme/theme';
import { Toaster } from './theme/toaster';

/** Demo tools are on unless explicitly disabled (NEXT_PUBLIC_DEMO_TOOLS=false). */
const demoTools = process.env.NEXT_PUBLIC_DEMO_TOOLS !== 'false';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        <MockApiGate fallback={null}>
          <SyncBridge />
          {demoTools && <DemoPanel />}
        </MockApiGate>
      </QueryProvider>
      <Toaster />
    </ThemeProvider>
  );
}
