import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleAuthService } from './google-auth.service';

jest.mock('google-auth-library');

const MockOAuth2Client = OAuth2Client as jest.MockedClass<typeof OAuth2Client>;

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let mockVerifyIdToken: jest.Mock;

  beforeEach(() => {
    mockVerifyIdToken = jest.fn();
    MockOAuth2Client.mockImplementation(
      () => ({ verifyIdToken: mockVerifyIdToken }) as unknown as OAuth2Client,
    );
    const config = {
      getOrThrow: jest.fn().mockReturnValue('test-client-id'),
    } as unknown as ConfigService;
    service = new GoogleAuthService(config);
  });

  it('returns GoogleProfile for a valid idToken', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-123',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'http://pic.url',
      }),
    });

    const result = await service.verify('valid-token');

    expect(result).toEqual({
      googleSub: 'google-123',
      email: 'user@example.com',
      nickname: 'Test User',
      profileImageUrl: 'http://pic.url',
    });
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-token',
      audience: 'test-client-id',
    });
  });

  it('throws UnauthorizedException when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
    await expect(service.verify('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when payload is missing sub', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'u@e.com' }),
    });
    await expect(service.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when payload is missing email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'g-123' }),
    });
    await expect(service.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses email prefix as nickname when name is absent', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'g-123', email: 'john@example.com' }),
    });
    const result = await service.verify('token');
    expect(result.nickname).toBe('john');
  });
});
