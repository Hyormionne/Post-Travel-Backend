import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes a password and verifies it', async () => {
    const hash = await service.hash('plaintext-pw-1234');
    expect(hash).not.toBe('plaintext-pw-1234');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await service.verify('plaintext-pw-1234', hash)).toBe(true);
  });

  it('verify returns false for wrong password', async () => {
    const hash = await service.hash('right');
    expect(await service.verify('wrong', hash)).toBe(false);
  });
});
