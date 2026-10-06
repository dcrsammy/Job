import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-10">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
