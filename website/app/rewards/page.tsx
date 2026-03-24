import Link from "next/link";

export default function RewardsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Rewards</h1>
      <Link
        href="/invite"
        className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
      >
        Invite Friends
      </Link>
    </main>
  );
}
