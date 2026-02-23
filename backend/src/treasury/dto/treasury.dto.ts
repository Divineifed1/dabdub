import { IsEthereumAddress, IsString, MinLength, MaxLength, IsArray } from 'class-validator';

export class AddWhitelistAddressDto {
  @IsEthereumAddress()
  address: string;

  @IsString()
  @MinLength(5)
  @MaxLength(100)
  label: string;

  @IsArray()
  @IsString({ each: true })
  allowedChains: string[];
}

export class RequestTreasuryWithdrawalDto {
  @IsString()
  chain: string;

  @IsEthereumAddress()
  toAddress: string;

  @IsString()
  tokenAmount: string;

  @IsString()
  tokenSymbol: string;

  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  reason: string;

  confirmed: boolean;
}

export class RejectWithdrawalDto {
  @IsString()
  @MinLength(20)
  rejectionReason: string;
}

export class WithdrawalFilterDto {
  chain?: string;
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}
