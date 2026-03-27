"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import Sidebar from "./Sidebar";

export default function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStandalonePage = pathname === "/reset-password";

  if (isStandalonePage) {
    return <>{children}</>;
  }

  return (
    <>
      <AppHeader />
      <Sidebar />
      <main className="flex-1 overflow-visible p-4 sm:p-6">
        {children}
      </main>
    </>
  );
}
