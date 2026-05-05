import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class PhotoResultDto {
  @ApiProperty({ example: 'uuid-photo' })
  @IsString()
  photoId!: string;

  @ApiProperty({ example: 'beach' })
  @IsString()
  sceneLabel!: string;

  @ApiProperty({ example: '석양이 지는 해변의 모습' })
  @IsString()
  aiCaption!: string;

  @ApiProperty({ example: ['beach', 'sunset'] })
  @IsArray()
  @IsString({ each: true })
  aiKeywords!: string[];
}

export class ClusterSuggestionDto {
  @ApiProperty({ example: '해변 나들이' })
  @IsString()
  title!: string;

  @ApiProperty({ example: '바다를 따라 걷던 오후' })
  @IsString()
  summary!: string;

  @ApiProperty({ example: 'beach' })
  @IsString()
  sceneLabel!: string;

  @ApiProperty({ example: ['uuid-photo'] })
  @IsArray()
  @IsString({ each: true })
  photoIds!: string[];
}

export class JobCallbackDto {
  @ApiProperty({
    type: [PhotoResultDto],
    example: [
      {
        photoId: 'uuid-photo',
        sceneLabel: 'beach',
        aiCaption: '석양이 지는 해변',
        aiKeywords: ['beach', 'sunset'],
      },
    ],
  })
  @ValidateNested({ each: true })
  @Type(() => PhotoResultDto)
  results!: PhotoResultDto[];

  @ApiProperty({
    type: ClusterSuggestionDto,
    required: false,
    example: {
      title: '해변 나들이',
      summary: '바다를 따라 걷던 오후',
      sceneLabel: 'beach',
      photoIds: ['uuid-photo'],
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClusterSuggestionDto)
  cluster?: ClusterSuggestionDto;
}
