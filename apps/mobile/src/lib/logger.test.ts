import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { NetworkError } from '@/lib/api/errors';

import { addReportingBreadcrumb, reportError } from './error-reporting';
import { errorFields, logger } from './logger';

// The reporting boundary is mocked; which errors count as reportable is its real rule.
jest.mock('./error-reporting', () => ({
  ...jest.requireActual<typeof import('./error-reporting')>('./error-reporting'),
  addReportingBreadcrumb: jest.fn(),
  reportError: jest.fn(),
}));

const breadcrumb = jest.mocked(addReportingBreadcrumb);
const report = jest.mocked(reportError);

beforeEach(() => {
  breadcrumb.mockClear();
  report.mockClear();
});

describe('logger → error reporting', () => {
  it('leaves a breadcrumb for every event, and reports nothing for info', () => {
    logger.info('auth.session.started');

    expect(breadcrumb).toHaveBeenCalledWith('info', 'auth.session.started', undefined);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a warning carrying an unexpected error, with the original error', () => {
    const error = new TypeError('x is undefined');

    logger.warn('groups.load.failed', errorFields(error));

    expect(report).toHaveBeenCalledWith('warn', 'groups.load.failed', error, {
      errorName: 'TypeError',
      errorMessage: 'x is undefined',
    });
  });

  it('does not report an expected failure, but keeps it as a breadcrumb', () => {
    logger.warn('friends.list.failed', errorFields(new NetworkError()));

    expect(report).not.toHaveBeenCalled();
    expect(breadcrumb).toHaveBeenCalledWith('warn', 'friends.list.failed', {
      errorName: 'NetworkError',
      errorMessage: 'Could not reach the server',
    });
  });

  it('does not report a warning that carries no error', () => {
    logger.warn('something.odd', { count: 2 });

    expect(report).not.toHaveBeenCalled();
  });

  it('always reports an error, with or without an error object', () => {
    logger.error('thing.impossible', { step: 'b' });

    expect(report).toHaveBeenCalledWith('error', 'thing.impossible', undefined, { step: 'b' });
  });
});

describe('errorFields', () => {
  it('stays plain, printable fields', () => {
    const fields = errorFields(new Error('boom'));

    expect(Object.keys(fields)).toEqual(['errorName', 'errorMessage']);
    expect(JSON.stringify(fields)).toBe('{"errorName":"Error","errorMessage":"boom"}');
  });

  it('serialises a thrown non-error', () => {
    expect(JSON.stringify(errorFields('odd'))).toBe('{"errorMessage":"odd"}');
  });
});
