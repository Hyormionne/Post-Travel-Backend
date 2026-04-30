import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PhotoCompleteItem {
  @ApiProperty({ example: 'uuid-photo' })
  @IsUUID()
  photoId: string;

  @ApiProperty({ example: 'rooms/uuid-room/photos/uuid-photo.jpg' })
  @IsString()
  s3Key: string;

  @ApiProperty({ example: 'rooms/uuid-room/thumbs/uuid-photo.jpg', required: false })
  @IsOptional()
  @IsString()
  thumbnailKey?: string;

  @ApiProperty({ example: 5242880 })
  @IsInt()
  @Min(1)
  fileSize: number;

  @ApiProperty({ example: 4032, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiProperty({ example: 3024, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @ApiProperty({ example: '2025-07-15T10:30:00.000Z', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  takenAt?: Date;

  @ApiProperty({ example: 37.5665, required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ example: 126.978, required: false })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CompleteUploadDto {
  @ApiProperty({ example: 'uuid-room' })
  @IsUUID()
  roomId: string;

  @ApiProperty({ type: [PhotoCompleteItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoCompleteItem)
  photos: PhotoCompleteItem[];
}
