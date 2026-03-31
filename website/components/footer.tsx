import Link from "next/link";

const FOOTER_LINKS = [
  { label: "Invite Friends", href: "/invite" },
  { label: "Resources", href: "/resources" },
  { label: "Feedback", href: "/feedback" },
  { label: "Legal Disclaimer", href: "/legal" },
];

export function Footer() {
  return (
    <footer className="w-full bg-gray-200 dark:bg-gray-800 text-black dark:text-white mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <nav className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:underline transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 border-t border-gray-300 dark:border-gray-600 pt-4 text-center text-xs text-gray-600 dark:text-gray-400">
          &copy; 2026 Frontier Stream, Inc. All Rights Reserved. Patent Pending.
        </div>
      </div>
    </footer>
  );
}
