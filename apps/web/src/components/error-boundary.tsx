import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // Dev-only — production uses structured API logging / Sentry on the server
      console.error('UI ErrorBoundary', error, info.componentStack);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              The page hit an unexpected error. Your data is safe — try reloading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground font-mono break-all">
              {this.state.error.message}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
