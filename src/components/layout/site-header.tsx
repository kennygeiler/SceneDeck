"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/browse", label: "Browse" },
  { href: "/visualize", label: "Visualize" },
  { href: "/ingest", label: "Ingest" },
  { href: "/tuning", label: "Boundary Tuning" },
  { href: "/verify", label: "Review" },
  { href: "/export", label: "Export" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  function isActiveRoute(href: string) {
    if (href === "/") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="mt-3 flex items-center justify-between rounded-full border px-3 py-2.5 shadow-[var(--shadow-lg)] backdrop-blur-xl sm:mt-4 sm:px-6 sm:py-3"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 78%, transparent)",
          }}
        >
          <div className="flex min-w-0 items-center gap-4 md:gap-6">
            <Link
              href="/"
              className="min-w-0 shrink-0 transition-colors hover:text-[var(--color-interactive-hover)]"
            >
              <div>
                <p
                  className="truncate text-sm font-bold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-base md:text-lg"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  MetroVision
                </p>
                <p className="hidden font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] sm:block laser-text">
                  Motion intelligence archive
                </p>
              </div>
            </Link>

            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 md:flex"
            >
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "rounded-full px-3 hover:text-[var(--color-text-primary)]",
                    isActiveRoute(item.href)
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)]",
                  )}
                  style={
                    isActiveRoute(item.href)
                      ? {
                          backgroundColor:
                            "color-mix(in oklch, var(--color-accent-base) 14%, transparent)",
                          borderColor:
                            "color-mix(in oklch, var(--color-accent-base) 32%, transparent)",
                        }
                      : undefined
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "rounded-full border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] md:hidden",
              )}
              aria-expanded={menuOpen}
              aria-controls="mobile-primary-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>

            <Link
              href="/browse"
              aria-label="Search shots"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "rounded-full border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] md:hidden",
              )}
            >
              <Search aria-hidden="true" />
            </Link>

            <Link
              href="/browse"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "hidden rounded-full border-[var(--color-border-default)] bg-transparent px-4 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] sm:inline-flex",
              )}
            >
              Open archive
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-[color-mix(in_oklch,black_55%,transparent)] md:hidden"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="mobile-primary-nav"
            aria-label="Primary"
            className="fixed left-3 right-3 top-[calc(3.5rem+0.75rem)] z-[60] max-h-[min(70vh,calc(100dvh-5rem))] overflow-y-auto rounded-[var(--radius-xl)] border p-2 shadow-[var(--shadow-xl)] md:hidden"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 92%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 78%, transparent)",
            }}
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-12 items-center rounded-[var(--radius-lg)] px-4 text-base font-medium transition-colors",
                  isActiveRoute(item.href)
                    ? "bg-[color-mix(in_oklch,var(--color-accent-base)_14%,transparent)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] active:bg-[var(--color-surface-tertiary)]",
                )}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </motion.header>
  );
}
