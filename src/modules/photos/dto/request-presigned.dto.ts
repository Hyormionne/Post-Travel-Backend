import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PresignedFileItem {
  @ApiProperty({ example: 'photo1.jpg' })
  @IsString()
  name: string;

  @ApiProperty({ example: 5242880, description: '바이트 단위 파일 크기' })
  @IsInt()
  @Min(1)
  size: number;

  @ApiProperty({ example: 'image/jpeg', enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;
}

export class RequestPresignedDto {
  @ApiProperty({ example: 'uuid-room' })
  @IsUUID()
  roomId: string;

  @ApiProperty({ type: [PresignedFileItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PresignedFileItem)
  @ArrayMinSize(1)
  @ArrayMaxSize(50, { message: 'files must have at most 50 elements' })
  files: PresignedFileItem[];
}
