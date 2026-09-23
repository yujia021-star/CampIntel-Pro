export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="spinner" />
      <div>{message}</div>
    </div>
  );
}
