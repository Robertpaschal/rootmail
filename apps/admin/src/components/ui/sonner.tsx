"use client";

import { Toaster as Sonner } from "sonner";

/** App-wide toast host. Mounted once in the root layout; call `toast()` from
 * "sonner" anywhere in a client component. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ duration: 4000 }}
    />
  );
}
