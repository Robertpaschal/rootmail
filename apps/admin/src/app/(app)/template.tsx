"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// Page transition on every navigation (Next remounts a template per nav).
// Entrance-only and subtle. Guards: rests at transform:none (fixed/sticky
// descendants stay anchored), and pages mounted in a HIDDEN tab render visible
// immediately — rAF doesn't tick there, so an entrance would hold the page at
// opacity 0 until focus.
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  const [enter] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );
  return (
    <motion.div
      initial={enter ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
