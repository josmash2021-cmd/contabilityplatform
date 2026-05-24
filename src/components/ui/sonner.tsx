import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "bg-white border border-neutral-200 shadow-lg rounded-lg text-sm font-medium",
          title: "text-neutral-900",
          description: "text-neutral-500",
          success: "bg-white border-emerald-200 text-emerald-700",
          error: "bg-white border-red-200 text-red-700",
          warning: "bg-white border-amber-200 text-amber-700",
          info: "bg-white border-blue-200 text-blue-700",
        },
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#171717",
          "--normal-border": "#e5e5e5",
          "--border-radius": "0.5rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
