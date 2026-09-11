import { jest } from '@jest/globals';

import type { AuthorizedFetch } from '@/lib/api/client';

/** A minimal stand-in for a `fetch` response, enough for the API client. */
export function response(body: {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
}): Response {
  return {
    ok: body.ok ?? true,
    status: body.status ?? 200,
    json: async () => body.jsonBody ?? {},
  } as Response;
}

/** Stands in for `AuthClient.authorizedFetch`, which already handles 401s. */
export function fakeAuthorizedFetch(result: Response) {
  return jest.fn<AuthorizedFetch>().mockResolvedValue(result);
}

export const ada = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada',
  picture: null,
};

export const grace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Grace',
  picture: null,
};

export const invite = {
  code: 'Zx3k9QpL2mN7vR1sT4uW8g',
  url: 'https://api.test/i/Zx3k9QpL2mN7vR1sT4uW8g',
  expiresAt: '2026-09-17T12:00:00.000Z',
};

export const groupSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'standard' as const,
  name: 'Corsica 2026',
  memberCount: 2,
  archivedAt: null,
  createdAt: '2026-09-11T12:00:00.000Z',
};

export const groupDetail = {
  ...groupSummary,
  members: [
    { ...ada, role: 'owner' as const },
    { ...grace, role: 'member' as const },
  ],
  viewerRole: 'owner' as const,
};

export const transaction = {
  id: '44444444-4444-4444-8444-444444444444',
  groupId: groupSummary.id,
  kind: 'expense' as const,
  title: 'Groceries',
  amountCents: 4250,
  occurredOn: '2026-09-11',
  comment: null,
  payer: ada,
  splitMode: 'shares' as const,
  participants: [
    { user: ada, shareCents: 2125, weight: 1 },
    { user: grace, shareCents: 2125, weight: 1 },
  ],
  createdBy: ada.id,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
};

export const balances = [
  { userId: ada.id, amountCents: 2125 },
  { userId: grace.id, amountCents: -2125 },
];
