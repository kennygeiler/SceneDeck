"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/browse", label: "Browse" },
  { href: "/verify", label: "Verify" },
  { href: "/export", label: "Export" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

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
          className="mt-4 flex items-center justify-between rounded-full border px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-xl sm:px-6"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 78%, transparent)",
          }}
        >
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="transition-colors hover:text-[var(--color-interactive-hover)]"
            >
              <div>
                <p
                  className="text-base font-bold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-lg"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  SceneDeck
                </p>
                <p className="hidden font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] sm:block">
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

          <div className="flex items-center gap-2">
            <Link
              href="/browse"
              aria-label="Search shots"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "rounded-full border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] sm:hidden",
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
    </motion.header>
  );
}
