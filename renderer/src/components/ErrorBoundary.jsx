import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.label ?? "app"}]`, error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card">
          <h2 className="error-boundary__title">{this.props.title ?? "Something went wrong"}</h2>
          <p className="error-boundary__message">
            {this.props.description ?? "Your data on disk has not been changed. You can try again, or restart AirPaste."}
          </p>
          <button type="button" className="error-boundary__retry" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
