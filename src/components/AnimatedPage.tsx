import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Wraps page content with a smooth fade-up entrance animation */
export function AnimatedPage({ children, className, delay = 0 }: AnimatedPageProps) {
  return (
    <div
      className={cn("animate-fade-up", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Wraps cards with a subtle scale-in entrance animation */
export function AnimatedCard({ children, className, delay = 0 }: AnimatedPageProps) {
  return (
    <div
      className={cn("animate-scale-in", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Staggered children animation wrapper */
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({ children, className, staggerDelay = 60 }: StaggerContainerProps) {
  return (
    <div className={cn("stagger-children", className)} style={{ "--stagger-delay": `${staggerDelay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}
