import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class RegenerateInviteDto {
  @ApiProperty({
    example:
      'https://app.example.com/join/550e8400-e29b-41d4-a716-446655440000',
    required: true,
  })
  @IsNotEmpty()
  @IsUrl()
  inviteUrl: string;
}
