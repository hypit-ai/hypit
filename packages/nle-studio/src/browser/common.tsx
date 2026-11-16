import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton({ label, children, ...props }: {
  readonly label: string;
  readonly children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`icon-button ${props.className ?? ""}`} type="button" aria-label={label} title={label}>{children}</button>;
}
