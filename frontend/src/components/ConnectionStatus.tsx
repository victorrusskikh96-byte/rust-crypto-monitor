type ConnectionStatusProps = {
  state: 'loading' | 'connected' | 'disconnected';
  serviceState?: 'ready' | 'failed' | 'stopping' | undefined;
};

export function ConnectionStatus({ state, serviceState }: ConnectionStatusProps) {
  const label = state === 'loading'
    ? 'Connecting to local API'
    : state === 'connected' ? 'API connected' : 'API disconnected';
  const backendLabel = serviceState === 'ready'
    ? 'Backend ready'
    : serviceState === 'stopping' ? 'Backend stopping' : 'Backend unavailable';

  return (
    <div className={`connection-status connection-${state}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="connection-label"><span className="status-dot" aria-hidden="true" />{label}</span>
      {state === 'connected' && <span className="backend-state">{backendLabel}</span>}
    </div>
  );
}
