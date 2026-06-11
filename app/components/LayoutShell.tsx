"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";
import ModuleNav from "./ModuleNav";
import Sidebar from "./Sidebar";

export default function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStandalonePage = pathname === "/reset-password";
  const isHomePage = pathname === "/";

  if (isStandalonePage) {
    return <>{children}</>;
  }

  return (
    <>
      <AppHeader />
      {isHomePage ? <Sidebar /> : <ModuleNav />}
      <main className="flex-1 overflow-visible p-4 sm:p-6">
        {children}
      </main>
    </>
  );
}
