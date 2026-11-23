"use client";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster position="top-right" richColors closeButton toastOptions={{ style: { borderRadius: 14 } }} />
    </MotionConfig>
  );
}
