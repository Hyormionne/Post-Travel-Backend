import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/modules/users/users.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';

describe('AuthService', () => {
  let users: jest.Mocked<Partial<UsersService>>;
  let passwords: jest.Mocked<Partial<PasswordService>>;
  let tokens: jest.Mocked<Partial<TokenService>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      createWithPassword: jest.fn(),
      upsertByGoogleSub: jest.fn(),
    };
    passwords = { hash: jest.fn(), verify: jest.fn() };
    tokens = {
      issueAccessToken: jest.fn().mockResolvedValue('access'),
      issueRefreshToken: jest
        .fn()
        .mockResolvedValue({ token: 'refresh', jti: 'jti-1' }),
      verifyRefreshToken: jest.fn(),
      blacklistRefresh: jest.fn(),
      isRefreshBlacklisted: jest.fn(),
      issueOAuthCode: jest.fn().mockResolvedValue('oauth-code-abc'),
    };
    service = new AuthService(
      users as UsersService,
      passwords as PasswordService,
      tokens as TokenService,
    );
  });

  it('signup hashes password, creates user, issues tokens', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue(null);
    (passwords.hash as jest.Mock).mockResolvedValue('hashed');
    (users.createWithPassword as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
    });

    const result = await service.signup({
      email: 'a@b.com',
      password: 'pw1234',
      nickname: 'al',
    });

    expect(users.createWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      nickname: 'al',
      passwordHash: 'hashed',
    });
    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('signup throws ConflictException if email already exists', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({ id: 'u1' });
    await expect(
      service.signup({ email: 'a@b.com', password: 'pw', nickname: 'al' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login returns tokens on correct password', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: 'h',
    });
    (passwords.verify as jest.Mock).mockResolvedValue(true);

    const result = await service.login({ email: 'a@b.com', password: 'pw' });

    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('login throws UnauthorizedException on wrong password', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: 'h',
    });
    (passwords.verify as jest.Mock).mockResolvedValue(false);
    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login throws UnauthorizedException if user has no password (OAuth-only account)', async () => {
    (users.findByEmail as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: null,
    });
    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates tokens and blacklists old jti', async () => {
    (tokens.verifyRefreshToken as jest.Mock).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      jti: 'old',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    (tokens.isRefreshBlacklisted as jest.Mock).mockResolvedValue(false);

    const result = await service.refresh('old-refresh');

    expect(tokens.blacklistRefresh).toHaveBeenCalledWith(
      'old',
      expect.any(Number),
    );
    expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('refresh throws if token is blacklisted', async () => {
    (tokens.verifyRefreshToken as jest.Mock).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      jti: 'old',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    (tokens.isRefreshBlacklisted as jest.Mock).mockResolvedValue(true);
    await expect(service.refresh('old-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout blacklists refresh jti', async () => {
    (tokens.verifyRefreshToken as jest.Mock).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      jti: 'jti-x',
      exp: Math.floor(Date.now() / 1000) + 100,
    });
    await service.logout('refresh-token');
    expect(tokens.blacklistRefresh).toHaveBeenCalledWith(
      'jti-x',
      expect.any(Number),
    );
  });

  it('googleLogin upserts user and returns oauth code', async () => {
    (users.upsertByGoogleSub as jest.Mock).mockResolvedValue({
      id: 'u2',
      email: 'g@example.com',
    });
    const result = await service.googleLogin({
      googleSub: 'g-123',
      email: 'g@example.com',
      nickname: 'gUser',
      profileImageUrl: 'http://img',
    });
    expect(users.upsertByGoogleSub).toHaveBeenCalled();
    expect(tokens.issueOAuthCode).toHaveBeenCalledWith({
      sub: 'u2',
      email: 'g@example.com',
    });
    expect(result).toBe('oauth-code-abc');
  });
});
