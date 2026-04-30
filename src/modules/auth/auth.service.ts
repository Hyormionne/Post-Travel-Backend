import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/modules/users/users.service';
import { PasswordService } from './password/password.service';
import { TokenService } from './tokens/token.service';
import { GoogleAuthService } from './google/google-auth.service';

export interface SignupArgs {
  email: string;
  password: string;
  nickname: string;
}

export interface LoginArgs {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  async signup(args: SignupArgs): Promise<TokenPair> {
    const existing = await this.users.findByEmail(args.email);
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await this.passwords.hash(args.password);
    const user = await this.users.createWithPassword({
      email: args.email,
      nickname: args.nickname,
      passwordHash,
    });
    return this.issueTokenPair(user.id, user.email);
  }

  async login(args: LoginArgs): Promise<TokenPair> {
    const user = await this.users.findByEmail(args.email);
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');
    const valid = await this.passwords.verify(args.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokenPair(user.id, user.email);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    const blacklisted = await this.tokens.isRefreshBlacklisted(payload.jti);
    if (blacklisted) throw new UnauthorizedException('Refresh token revoked');
    const remainingTtl = Math.max(
      payload.exp - Math.floor(Date.now() / 1000),
      1,
    );
    await this.tokens.blacklistRefresh(payload.jti, remainingTtl);
    return this.issueTokenPair(payload.sub, payload.email);
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.tokens.verifyRefreshToken(refreshToken);
    const remainingTtl = Math.max(
      payload.exp - Math.floor(Date.now() / 1000),
      1,
    );
    await this.tokens.blacklistRefresh(payload.jti, remainingTtl);
  }

  async loginWithGoogleIdToken(idToken: string): Promise<TokenPair> {
    const profile = await this.googleAuth.verify(idToken);
    const user = await this.users.upsertByGoogleSub(profile);
    return this.issueTokenPair(user.id, user.email);
  }

  private async issueTokenPair(sub: string, email: string): Promise<TokenPair> {
    const accessToken = await this.tokens.issueAccessToken({ sub, email });
    const { token: refreshToken } = await this.tokens.issueRefreshToken({
      sub,
      email,
    });
    return { accessToken, refreshToken };
  }
}
