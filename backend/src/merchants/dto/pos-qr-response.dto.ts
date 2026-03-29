import { ApiProperty } from '@nestjs/swagger';
import { QrResponseDto } from '../../qr/dto/qr-response.dto';

export class PosQrResponseDto extends QrResponseDto {
  @ApiProperty({ example: '@alice' })
  username!: string;

  @ApiProperty({ example: 'Yaba Electronics' })
  businessName!: string;

  @ApiProperty({ 
    example: 'https://pub-r2.example.com/merchant-logos/yaba.webp', 
    nullable: true 
  })
  logoUrl?: string | null;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ enum: ['SILVER', 'GOLD'] })
  tier!: string;
}
