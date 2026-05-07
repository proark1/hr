import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Link href="/" className="text-lg font-semibold tracking-tight mb-6">OurTeamManagement</Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
