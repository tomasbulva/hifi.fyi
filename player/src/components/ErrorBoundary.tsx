import { Component, type ReactNode } from 'react';
import { reportError } from '../core/errorReport';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-5xl">💥</div>
          <p className="text-base text-text">Something went wrong</p>
          <p className="max-w-md text-small" style={{ color: 'var(--color-text-muted)' }}>{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="rounded-md bg-primary px-4 py-2 text-small font-semibold text-white cursor-pointer border-none"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
