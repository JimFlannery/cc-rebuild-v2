"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSession, signOut } from "@/lib/auth-client";
import { Tooltip } from "@/components/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Orders", href: "/orders" },
  { label: "Contracts", href: "/contracts" },
  { label: "Looping", href: "/looping" },
  { label: "Learn", href: "/learn" },
  { label: "Rewards", href: "/rewards" },
  { label: "Resources", href: "/resources" },
  { label: "Invite Friends", href: "/invite" },
  { label: "Feedback", href: "/feedback" },
];

const USER_MENU = [
  { label: "Profile", href: "/profile" },
  { label: "Notifications", href: "/notifications" },
  { label: "My Orders", href: "/orders/mine" },
  { label: "My Contracts", href: "/contracts/mine" },
];

export function Nav() {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: session } = useSession();
  const { connected, connecting, publicKey, connect, disconnect } = useWallet();

  // Derived auth state
  const isLoggedIn = !!session;
  const kycVerified = session?.user?.kycVerified ?? false;

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">

      {/* Row 1: Logo + actions */}
      <div className="flex h-12 items-center gap-3 px-4">

        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <Image src="/conditioncover-symbol.svg" alt="ConditionCover" width={26} height={26} />
          <span>ConditionCover</span>
        </Link>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {isLoggedIn ? (
            <>
              {/* State 3 & 4: wallet button — only shown when logged in */}
              {connected ? (
                // State 4: wallet connected — show truncated address
                <button
                  onClick={() => disconnect()}
                  className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  {publicKey
                    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
                    : "Wallet"}
                </button>
              ) : kycVerified ? (
                // State 3: KYC done, wallet not connected — active Connect Wallet
                <button
                  onClick={() => connect().catch(() => {})}
                  disabled={connecting}
                  className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {connecting ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                // State 2: logged in but KYC not verified — disabled with tooltip
                <Tooltip content="Complete identity verification to connect a wallet">
                  <button
                    disabled
                    className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground opacity-40 cursor-not-allowed"
                  >
                    Connect Wallet
                  </button>
                </Tooltip>
              )}

              {/* Profile dropdown (all logged-in states) */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                >
                  {session.user.name?.[0]?.toUpperCase() ?? "U"}
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-popover py-1 shadow-lg">
                    {USER_MENU.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <div className="my-1 border-t border-border" />
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            // State 1: not logged in — Login only
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Login
            </Link>
          )}
        </div>
      </div>

      {/* Row 2: Scrollable nav links */}
      <nav className="flex overflow-x-auto px-4 pb-2 gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              pathname === link.href
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

    </header>
  );
}
