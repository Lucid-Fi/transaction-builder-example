"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const [label, setLabel] = useState("Copy");
  async function onClick() {
    try {
      // navigator.clipboard is undefined outside secure contexts (plain http on a LAN IP).
      await navigator.clipboard.writeText(value);
      setLabel("Copied");
    } catch {
      setLabel("Copy failed");
    }
    setTimeout(() => setLabel("Copy"), 1500);
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
