import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Auto-recover after this many ms (0 = no auto-recover) */
  autoRecoverMs?: number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  countdown: number;
}

/**
 * Error boundary that catches render errors and auto-recovers.
 * Designed for kiosk/display screens that must stay running unattended.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  private timer: ReturnType<typeof setInterval> | null = null;

  static defaultProps = { autoRecoverMs: 10_000 };

  state: State = { hasError: false, error: null, countdown: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  componentDidUpdate(_: Props, prev: State) {
    const { autoRecoverMs } = this.props;
    if (this.state.hasError && !prev.hasError && autoRecoverMs && autoRecoverMs > 0) {
      const seconds = Math.ceil(autoRecoverMs / 1000);
      this.setState({ countdown: seconds });
      this.timer = setInterval(() => {
        this.setState(s => {
          const next = s.countdown - 1;
          if (next <= 0) {
            this.clearTimer();
            return { hasError: false, error: null, countdown: 0 };
          }
          return { countdown: next };
        });
      }, 1000);
    }
  }

  componentWillUnmount() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private handleRecover = () => {
    this.clearTimer();
    this.setState({ hasError: false, error: null, countdown: 0 });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
        background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#888', maxWidth: 400 }}>
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
        </div>
        {this.state.countdown > 0 && (
          <p style={{ fontSize: 13, color: '#666' }}>
            Auto-recovering in {this.state.countdown}s…
          </p>
        )}
        <button
          onClick={this.handleRecover}
          style={{
            padding: '10px 28px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, cursor: 'pointer',
          }}
        >
          Recover Now
        </button>
      </div>
    );
  }
}
