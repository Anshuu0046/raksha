import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-semibold transition-[background-color,box-shadow,transform,color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-navy-900 text-white hover:bg-navy-800",
        sos: "bg-sos text-white hover:bg-sos-hover",
        safe: "bg-safe text-white hover:bg-safe-ink",
        outline: "border border-line-strong bg-surface text-ink hover:bg-ground",
        subtle: "bg-ground text-ink hover:bg-line",
        ghost: "text-ink hover:bg-ground",
        danger: "border border-sos/40 bg-surface text-sos-ink hover:bg-sos-soft",
        onDark: "on-dark bg-white/10 text-white hover:bg-white/16",
        onDarkSolid: "on-dark bg-white text-navy-900 hover:bg-navy-200",
        link: "h-auto rounded-none px-0 text-ink underline hover:text-navy-700 active:scale-100",
      },
      size: {
        sm: "h-10 px-3.5 text-sm [&_svg]:size-4",
        md: "h-12 px-5 text-[15px] [&_svg]:size-5",
        lg: "h-14 px-6 text-base [&_svg]:size-5",
        xl: "h-16 px-6 text-lg [&_svg]:size-6",
        icon: "size-12 [&_svg]:size-5",
        iconSm: "size-10 [&_svg]:size-[18px]",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && !asChild ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
