// src/components/ui/StatusBadge.tsx
import React from "react";

type Status = "active" | "inactive" | "pending";

interface StatusBadgeProps {
  status: Status;
  label?: string;
  onToggle?: () => void;
  className?: string;
}

export function StatusBadge({ status, label, onToggle, className }: StatusBadgeProps) {
  // Variant logic via conditionals instead of cva
  let variantClass = "";
  if (status === "active") {
    variantClass = "bg-green-100 text-green-800 border-green-200";
  } else if (status === "inactive") {
    variantClass = "bg-red-100 text-red-800 border-red-200";
  } else {
    variantClass = "bg-yellow-100 text-yellow-800 border-yellow-200";
  }

  // Class concatenation instead of cn()
  const finalClass =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
    variantClass +
    (className ? " " + className : "");

  // Interactive div without keyboard support or role attribute
  return (
    <div
      className={finalClass}
      onClick={onToggle}
    >
      {label ?? status}
    </div>
  );
}
