"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSession, signOut } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginModal } from "@/components/login-modal";
import { cn } from "@/lib/utils";

const SUPPORTED_WALLETS = [
  { name: "Phantom", icon: "/Phantom_SVG_Icon.svg" },
];

const NAV_LINKS = [
  { label: "Markets", href: "/markets" },
  { label: "Dashboards", href: "/dashboards" },
  { label: "Yield Boost", href: "/yieldboost" },
  { label: "Hedge", href: "/hedge" },
  { label: "Learn-to-Earn", href: "/learn" },
  { label: "Rewards", href: "/rewards" },
];

const USER_MENU = [
  { label: "Profile", href: "/profile" },
  { label: "Notifications", href: "/notifications" },
  { label: "My Orders", href: "/orders" },
  { label: "My Contracts", href: "/contracts" },
];

export function Nav() {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: session } = useSession();
  const { connected, connecting, publicKey, connect, disconnect, select, wallet } = useWallet();
  const [connectPending, setConnectPending] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  // Derived auth state
  const isLoggedIn = !!session;

  // After select('Phantom') sets the wallet in state, trigger connect()
  useEffect(() => {
    if (connectPending && wallet) {
      setConnectPending(false);
      connect().catch(() => {});
    }
  }, [connectPending, wallet, connect]);

  function handleConnectWallet() {
    if (wallet) {
      connect().catch(() => {});
    } else {
      select("Phantom");
      setConnectPending(true);
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
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
    <>
    <header className="sticky top-0 z-50 w-full border-b border-gray-300 dark:border-white/20 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl w-full">

      {/* Row 1: Logo + tagline + actions */}
      <div className="relative flex flex-col sm:flex-row sm:h-12 items-center gap-2 px-4 py-2 sm:py-0">

        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <Image src="/conditioncover-symbol.svg" alt="ConditionCover" width={32} height={32} />
          <span className="text-xl">ConditionCover</span>
        </Link>

        {/* Tagline — hidden when too narrow */}
        <span className="hidden md:block absolute left-1/2 -translate-x-1/2 text-base font-bold text-foreground tracking-wide pointer-events-none">
          Tokenized Environmental Cover Markets
        </span>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <ThemeToggle />

          {isLoggedIn ? (
            <>
              {/* State 3 & 4: wallet button — only shown when logged in */}
              <div className="relative" ref={walletMenuRef}>
                {connected ? (
                  // Connected — show address button that opens disconnect menu
                  <button
                    onClick={() => setWalletMenuOpen((v) => !v)}
                    className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <Image src="/Phantom_SVG_Icon.svg" alt="Phantom" width={16} height={16} />
                    {publicKey
                      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
                      : "Wallet"}
                  </button>
                ) : (
                  // Not connected — open wallet selection menu
                  <button
                    onClick={() => setWalletMenuOpen((v) => !v)}
                    disabled={connecting}
                    className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {connecting ? "Connecting…" : "Connect Wallet"}
                  </button>
                )}

                {walletMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-popover py-1 shadow-lg z-50">
                    {!connected && (
                      <>
                        <p className="px-4 py-1.5 text-xs text-muted-foreground">Select wallet</p>
                        {SUPPORTED_WALLETS.map((w) => (
                          <button
                            key={w.name}
                            onClick={() => {
                              setWalletMenuOpen(false);
                              handleConnectWallet();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <Image src={w.icon} alt={w.name} width={20} height={20} />
                            {w.name}
                          </button>
                        ))}
                      </>
                    )}
                    {connected && (
                      <button
                        onClick={() => {
                          setWalletMenuOpen(false);
                          disconnect();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <span className="w-5 h-5 flex items-center justify-center text-muted-foreground">✕</span>
                        Disconnect
                      </button>
                    )}
                  </div>
                )}
              </div>

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
            <button
              onClick={() => setLoginOpen(true)}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Login
            </button>
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
              "shrink-0 rounded-md px-3 py-1.5 text-md font-medium transition-colors whitespace-nowrap",
              pathname === link.href
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      </div>
    </header>
    {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </>
  );
}
