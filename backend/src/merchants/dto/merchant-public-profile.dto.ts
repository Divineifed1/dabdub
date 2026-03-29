import { ApiProperty } from '@nestjs/swagger';

import { TierName } from '../../../tier-config/entities/tier-config.entity';

export class MerchantPublicProfileDto {
  @ApiProperty({ example: 'Yaba Electronics' })
  businessName!: string;

  @ApiProperty({ 
    example: 'https://pub-r2.example.com/merchant-logos/yaba.webp',
    nullable: true 
  })
  logoUrl?: string | null;

  @ApiProperty({ example: '@alice' })
  username!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ enum: TierName })
  tier!: TierName;
}
