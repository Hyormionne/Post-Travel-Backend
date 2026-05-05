import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalAuthGuard } from './internal-auth.guard';
import type { AppEnv } from 'src/config/config.types';

function makeCtx(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('secret-token'),
    } as unknown as ConfigService<AppEnv>;
    guard = new InternalAuthGuard(config);
  });

  it('allows request with correct X-Internal-Token', () => {
    expect(
      guard.canActivate(makeCtx({ 'x-internal-token': 'secret-token' })),
    ).toBe(true);
  });

  it('throws UnauthorizedException when token is missing', () => {
    expect(() => guard.canActivate(makeCtx({}))).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token is wrong', () => {
    expect(() =>
      guard.canActivate(makeCtx({ 'x-internal-token': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });
});
