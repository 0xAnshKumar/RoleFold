import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Providers } from "@/app/providers";
import { ToastProvider } from "@/components/ui/Toast";
import Kit from "./Kit";

export const metadata: Metadata = { title: "Kit", robots: { index: false, follow: false } };

// Design-system v2 kit (DESIGN.md 6.8 step 1): every primitive in every state, light and night side by side.
// Dev only; set HUNT_KIT=1 to see it in a production build.
export default function KitPage() {
  if (process.env.NODE_ENV === "production" && process.env.HUNT_KIT !== "1") notFound();
  return (
    <Providers>
      <ToastProvider>
        <Kit />
      </ToastProvider>
    </Providers>
  );
}
