import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TopNav } from "@/components/nav/TopNav";
import { ToastProvider } from "@/components/toast/ToastProvider";

export const metadata: Metadata = {
  title: "Salary Day Autopilot",
  description: "Know what's safe to spend until your next salary.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <ToastProvider>
          <TopNav />
          {/* One centred column: full width on a 360px phone, capped on a laptop. */}
          <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-10">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
