import { fetch } from 'expo/fetch';

import { api, ApiError } from '@/api/client';

import liveResponse from './fixtures/extract-response.json';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const config = { apiUrl: 'https://api.example.com/', apiToken: ' secret ' };

function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Awaited<ReturnType<typeof fetch>>);
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => mockFetch.mockReset());

it('sends the bearer token to a normalized URL', async () => {
  respond(200, { categories: ['Groceries'], default: 'Other' });
  await api.categories(config);

  const [url, init] = mockFetch.mock.calls[0];
  expect(url).toBe('https://api.example.com/v1/categories');
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
});

it('uploads the file as multipart field "receipt" and returns the receipt', async () => {
  respond(200, liveResponse);
  const file = { name: 'r.jpg' } as never;
  const receipt = await api.extract(config, file);

  expect(receipt.vendor).toBe('Green Supermarket');
  const [url, init] = mockFetch.mock.calls[0];
  expect(url).toBe('https://api.example.com/v1/extract');
  expect(init?.method).toBe('POST');
  expect((init?.body as FormData).get('receipt')).toBeDefined();
});

it('surfaces the backend error code and message', async () => {
  respond(401, { error: { code: 'unauthorized', message: 'Missing or invalid API token.' } });
  const promise = api.categories(config);
  await expectApiError(promise, 'unauthorized');
  await expect(promise).rejects.toMatchObject({ status: 401, message: 'Missing or invalid API token.' });
});

it('handles non-JSON error pages', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  } as unknown as Awaited<ReturnType<typeof fetch>>);
  await expectApiError(api.health(config), 'http_error');
});

it('rejects a response that does not match the schema', async () => {
  respond(200, { receipt: { vendor: 'X' } });
  await expectApiError(api.extract(config, {} as never), 'bad_response');
});

it('maps a thrown fetch to a network error', async () => {
  mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expectApiError(api.health(config), 'network');
});
