"use client";

import { useEffect, useState } from "react";

// Time-of-day greeting. Renders a neutral default during SSR, then refines to the
// visitor's LOCAL time after mount — so it's accurate regardless of server timezone
// and doesn't trigger a hydration mismatch.
export function Greeting({ name }: { name: string }) {
  const [hi, setHi] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setHi(h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <>
      {hi}, {name}
    </>
  );
}
