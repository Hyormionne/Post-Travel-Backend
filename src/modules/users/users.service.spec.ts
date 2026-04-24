import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { create: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('createWithPassword calls prisma.user.create', async () => {
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    await service.createWithPassword({
      email: 'a@b.com',
      nickname: 'al',
      passwordHash: 'hash',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'a@b.com', nickname: 'al', password: 'hash' },
    });
  });

  it('findByEmail delegates to prisma.user.findUnique', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const result = await service.findByEmail('a@b.com');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
    });
    expect(result).toEqual({ id: 'u1' });
  });

  it('upsertByGoogleSub upserts by googleSub and sets email/nickname on create', async () => {
    prisma.user.upsert.mockResolvedValue({ id: 'u2' });
    await service.upsertByGoogleSub({
      googleSub: 'google-123',
      email: 'g@example.com',
      nickname: 'gUser',
      profileImageUrl: 'http://img',
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { googleSub: 'google-123' },
      update: { profileImageUrl: 'http://img' },
      create: {
        googleSub: 'google-123',
        email: 'g@example.com',
        nickname: 'gUser',
        profileImageUrl: 'http://img',
      },
    });
  });
});
