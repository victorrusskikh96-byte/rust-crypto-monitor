import type { Dashboard } from '../api/contracts';

type ModeNoticeProps = { dashboard: Dashboard };

export function ModeNotice({ dashboard }: ModeNoticeProps) {
  if (dashboard.mode === 'fixture') {
    return (
      <aside className="mode-notice fixture-notice" aria-labelledby="mode-title">
        <div className="notice-heading">
          <h2 id="mode-title">Synthetic fixture data</h2>
          <span className="mode-badge">Fixture mode</span>
        </div>
        <p className="fixture-scenario">Fixture scenario: <strong>{dashboard.fixture.scenario}</strong></p>
        <p>{dashboard.fixture.notice}</p>
      </aside>
    );
  }

  return (
    <aside className="mode-notice" aria-labelledby="mode-title">
      <div className="notice-heading">
        <h2 id="mode-title">Real mode</h2>
        <span className="mode-badge">Public market data</span>
      </div>
      <p>No market data is requested on page load. Observations appear only after an explicit backend refresh.</p>
    </aside>
  );
}
