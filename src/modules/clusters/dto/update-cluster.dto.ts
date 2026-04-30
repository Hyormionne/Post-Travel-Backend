import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateClusterDto {
  @ApiProperty({
    example: 'uuid-room',
    description: 'RoomMemberGuard가 사용하는 roomId',
  })
  @IsUUID()
  roomId: string;

  @ApiProperty({ example: '첫째 날 - 해변 산책' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;
}
