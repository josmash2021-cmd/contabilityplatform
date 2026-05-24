import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 bg-white min-h-screen">
          <h1 className="text-2xl font-bold text-red-600">Error en la aplicación</h1>
          <p className="mt-4 text-sm text-neutral-600">{this.state.error?.message}</p>
          <pre className="mt-4 p-4 bg-neutral-100 rounded text-xs overflow-auto">{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
