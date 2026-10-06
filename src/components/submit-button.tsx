"use client";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./ui";

export function SubmitButton({
  children,
  pending,
  variant = "primary",
  className,
  confirm,
  ...rest
}: {
  children: React.ReactNode;
  pending?: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
  confirm?: string;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const status = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={status.pending}
      aria-busy={status.pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      {...rest}
    >
      {status.pending ? pending ?? "Working…" : children}
    </Button>
  );
}
