"use client";

import { AccountPanel } from "./AccountPanel";
import { Logo } from "./Logo";
import { Activity } from "lucide-react";
import Link from "next/link";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 h-16">
      <div className="max-w-6xl mx-auto h-full px-4 md:px-8">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center h-full relative">
            <div className="absolute top-1/2 left-0 -translate-y-1/2 cursor-pointer transition-transform hover:scale-105 active:scale-95">
              <Link href="/">
                <Logo variant="mark" size="md" />
              </Link>
            </div>
            {/* Invisible spacer to reserve the width for the absolute logo */}
            <div className="w-[100px]" />
          </div>
          
          <div className="flex items-center gap-4 h-full">
            <AccountPanel />
          </div>
        </div>
      </div>
    </header>
  );
}
