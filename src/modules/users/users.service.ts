import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from 'generated/prisma/client';

export interface CreateWithPasswordArgs {
  email: string;
  nickname: string;
  passwordHash: string;
}

export interface UpsertGoogleArgs {
  googleSub: string;
  email: string;
  nickname: string;
  profileImageUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  createWithPassword(args: CreateWithPasswordArgs): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: args.email,
        nickname: args.nickname,
        password: args.passwordHash,
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  upsertByGoogleSub(args: UpsertGoogleArgs): Promise<User> {
    return this.prisma.user.upsert({
      where: { googleSub: args.googleSub },
      update: { profileImageUrl: args.profileImageUrl },
      create: {
        googleSub: args.googleSub,
        email: args.email,
        nickname: args.nickname,
        profileImageUrl: args.profileImageUrl,
      },
    });
  }
}
