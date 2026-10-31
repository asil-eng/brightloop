"use client";

import { useState } from "react";
import clsx from "clsx";

const rules = [
  { label: "More than 8 characters", test: (p: string) => p.length > 8 },
  { label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

/** Password field with a live checklist of the password rules. */
export function PasswordWithRules({ name = "password", label = "Password" }: { name?: string; label?: string }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type="password" required className="input" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} />
      <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
        {rules.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.label} className={clsx(ok ? "text-emerald-700" : "text-ink-secondary")}>
              {ok ? "✓" : "○"} {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
