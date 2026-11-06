import { Component, type ErrorInfo, type ReactNode } from "react";
import { useUi } from "../stores/ui.ts";

/** Giữ lỗi trong một panel: panel đó hiện thông báo, các panel khác vẫn chạy. */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    useUi.getState().log("error", `[${this.props.name}] ${error.message}`);
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pad" role="alert">
        <p>
          <strong>{this.props.name}</strong>: {this.state.error.message}
        </p>
        <button className="btn small" onClick={() => this.setState({ error: null })}>
          Thử lại / Retry
        </button>
      </div>
    );
  }
}
