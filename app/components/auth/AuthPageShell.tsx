import Image from "next/image";
import type { ReactNode } from "react";

type AuthPageShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export const AuthPageShell = ({
  title,
  description,
  children,
}: AuthPageShellProps) => {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex justify-center">
          <Image
            src="/futuretech_logo.svg"
            alt="未来技術推進協会"
            width={216}
            height={48}
            priority
          />
        </div>
        <h1 className="mb-2 text-center text-2xl font-semibold text-gray-900">
          {title}
        </h1>
        <p className="mb-6 text-center text-sm text-gray-600">{description}</p>
        {children}
      </div>
    </main>
  );
};
