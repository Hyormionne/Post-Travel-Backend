import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname!: string;
}
