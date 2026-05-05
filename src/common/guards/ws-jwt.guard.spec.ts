import { ExecutionContext } from '@nestjs/common';
import { WsJwtGuard } from './ws-jwt.guard';

function makeCtx(userId: string | undefined): ExecutionContext {
  return {
    switchToWs: () => ({ getClient: () => ({ data: { userId } }) }),
  } as unknown as ExecutionContext;
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  beforeEach(() => {
    guard = new WsJwtGuard();
  });

  it('returns true when userId is set on socket.data', () => {
    expect(guard.canActivate(makeCtx('user-1'))).toBe(true);
  });

  it('returns false when userId is undefined', () => {
    expect(guard.canActivate(makeCtx(undefined))).toBe(false);
  });
});
