import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { dashboard, fixtureNotice } from '../contracts/fixtures';

afterEach(() => vi.unstubAllGlobals());

function reply(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json'}});
}
function deferred<T>() {
  let resolve!: (value:T) => void;
  let reject!: (reason:unknown) => void;
  const promise = new Promise<T>((yes,no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}

describe('minimal dashboard shell', () => {
  it('shows loading while one relative dashboard GET is pending', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(screen.getByRole('heading',{name:'Rust Crypto Monitor'})).toBeTruthy();
    expect(screen.getByText(/Connecting to local API/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('/api/v1/dashboard');
    expect(options.method ?? 'GET').toBe('GET');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('renders fixture identity, permanent notice and separates provider availability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(dashboard()));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByText(/API connected/i)).toBeTruthy();
    expect(screen.getByText(/Backend ready/i)).toBeTruthy();
    expect(screen.getByRole('heading',{name:/Synthetic fixture data/i})).toBeTruthy();
    expect(screen.getByText((_,element) => element?.tagName === 'P' && element.textContent === 'Fixture scenario: success')).toBeTruthy();
    expect(screen.getByText(fixtureNotice)).toBeTruthy();
    expect(screen.getByText('opaque-token-0')).toBeTruthy();
    expect(screen.getByText(/No provider requests have been made/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('keeps real mode separate from fixture claims', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply(dashboard('real'))));
    render(<App />);
    expect(await screen.findByText(/API connected/i)).toBeTruthy();
    expect(screen.getByText(/Real mode/i)).toBeTruthy();
    expect(screen.queryByRole('heading',{name:/Synthetic fixture data/i})).toBeNull();
    expect(screen.queryByText(/Fixture scenario:/i)).toBeNull();
  });
  it.each(['offline','malformed','unsupported','http'] as const)('shows a safe disconnected state for %s', async kind => {
    const fetchMock = vi.fn();
    if (kind === 'offline') fetchMock.mockRejectedValue(new Error('private-provider-detail'));
    else if (kind === 'malformed') fetchMock.mockResolvedValue(new Response('private-raw-response',{status:200}));
    else if (kind === 'unsupported') fetchMock.mockResolvedValue(reply({...dashboard(),schema_version:99}));
    else fetchMock.mockResolvedValue(reply({error:{code:'invalid_origin',message:'Origin is not allowed'}},403));
    vi.stubGlobal('fetch',fetchMock);
    render(<App />);
    expect(await screen.findByText(/API disconnected/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain('private-');
    expect(screen.queryByText('opaque-token-0')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts on unmount and ignores an obsolete response after a new mount', async () => {
    const old = deferred<Response>();
    const fresh = dashboard();
    fresh.snapshot_id = 'fresh-snapshot';
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(reply(fresh));
    vi.stubGlobal('fetch',fetchMock);
    const first = render(<App />);
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    first.unmount();
    expect(options.signal!.aborted).toBe(true);
    render(<App />);
    expect(await screen.findByText('fresh-snapshot')).toBeTruthy();
    await act(async () => { old.resolve(reply(dashboard())); await old.promise; });
    expect(screen.getByText('fresh-snapshot')).toBeTruthy();
    expect(screen.queryByText('opaque-token-0')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('handles abort rejection without an unhandled error', async () => {
    const request = deferred<Response>();
    vi.stubGlobal('fetch',vi.fn().mockReturnValue(request.promise));
    const mounted = render(<App />);
    mounted.unmount();
    await act(async () => { request.reject(new DOMException('Aborted','AbortError')); await request.promise.catch(() => {}); });
    expect(document.body.textContent).toBe('');
  });
  it('does not confuse a failed worker with an offline HTTP API', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...dashboard(),service_state:'failed',service_error:{code:'worker_failed',message:'Market worker failed'}})));
    render(<App />);
    expect(await screen.findByText(/API connected/i)).toBeTruthy();
    expect(screen.getByText(/Backend unavailable/i)).toBeTruthy();
    expect(screen.getByText(/No provider requests have been made/i)).toBeTruthy();
  });
});
