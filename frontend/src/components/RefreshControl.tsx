type RefreshControlProps = {
  disabled: boolean;
  pending: boolean;
  reconciling: boolean;
  cooldownSeconds: string | null;
  message: string;
  onRefresh: () => void;
  onReconcile?: (() => void) | undefined;
};

export function RefreshControl({ disabled, pending, reconciling, cooldownSeconds, message, onRefresh, onReconcile }: RefreshControlProps) {
  return (
    <section className="panel refresh-panel" aria-labelledby="refresh-title">
      <div className="refresh-description">
        <h2 id="refresh-title">Manual refresh</h2>
        <p>Request a new observation for both markets with one explicit action.</p>
        <p className="refresh-feedback" role="status" aria-live="polite">{message}</p>
        {cooldownSeconds !== null && <p className="cooldown-label">Estimated cooldown: {cooldownSeconds} seconds. The backend decides when another refresh is allowed.</p>}
        {reconciling && <p className="muted">Reading backend state. This read does not start another market refresh.</p>}
      </div>
      <div className="refresh-actions">
        <button className="refresh-button" type="button" disabled={disabled || pending || reconciling} onClick={onRefresh} aria-label="Refresh markets">
          {pending ? 'Refreshing…' : 'Refresh markets'}
        </button>
        {onReconcile && <button className="reconcile-button" type="button" disabled={pending || reconciling} onClick={onReconcile}>Read backend state</button>}
      </div>
    </section>
  );
}
