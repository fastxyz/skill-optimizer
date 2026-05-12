// src/components/ui/UserCard.tsx
import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UserCardProps {
  name: string;
  email: string;
  role: "admin" | "user" | "guest";
  onAction: () => void;
}

export function UserCard({ name, email, role, onAction }: UserCardProps) {
  // Build class string by concatenation — not using cn()
  let cardClass = "rounded-lg border p-4";
  if (role === "admin") {
    cardClass = cardClass + " border-blue-500 bg-blue-50";
  } else if (role === "guest") {
    cardClass = cardClass + " border-gray-300 bg-gray-50";
  }

  // Hard-coded color values instead of CSS design-token variables
  const badgeColors: Record<string, string> = {
    admin: "bg-blue-600 text-white",
    user: "bg-green-600 text-white",
    guest: "bg-gray-400 text-white",
  };

  const badgeClass = "px-2 py-1 rounded text-xs font-medium " + badgeColors[role];

  return (
    <Card className={cardClass}>
      <CardHeader>
        <h3 className="font-semibold text-base">{name}</h3>
        <p className="text-gray-500 text-sm">{email}</p>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className={badgeClass}>{role}</span>
        <Button
          onClick={onAction}
          aria-pressed={undefined}
          aria-expanded={undefined}
        >
          View Profile
        </Button>
      </CardContent>
    </Card>
  );
}
