import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salary Day Autopilot",
  description: "Plan your month from one salary day to the next.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 sm:py-10">
          <header className="mb-6">
            <p className="text-lg font-semibold tracking-tight">Salary Day Autopilot</p>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
