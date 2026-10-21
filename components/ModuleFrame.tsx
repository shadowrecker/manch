'use client';

import { usePathname } from 'next/navigation';
import { moduleForPath } from '@/lib/nav';

// Tags the page with data-module="post|reels|deals|check" so each module's
// palette and component styles (app/styles/<module>.css) apply to the nav and
// content alike. Home / Settings keep the core Manch palette.
export function ModuleFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const active = moduleForPath(pathname);
  return (
    <div className="module-frame" data-module={active ?? 'core'}>
      {children}
    </div>
  );
}
