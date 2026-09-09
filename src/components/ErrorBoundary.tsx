import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-100 rounded-lg border border-slate-300 m-4">
          <div className="max-w-xl w-full bg-white p-6 rounded-lg shadow-md border border-red-200">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {this.props.fallbackTitle || 'A display error occurred'}
                </h3>
                <p className="text-xs text-slate-500">
                  An unexpected issue was caught while rendering this view.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-red-50 text-red-800 text-xs font-mono p-3 rounded border border-red-200 mb-4 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center space-x-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded transition shadow-sm cursor-pointer"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs rounded transition shadow-sm cursor-pointer"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
