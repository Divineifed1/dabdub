import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { AdminThrottlerGuard } from '../../common/guards/admin-throttler.guard';
import { AdminTwoFactorService } from '../services/admin-two-factor.service';
import {
  TwoFactorSetupResponseDto,
  VerifySetupDto,
  VerifySetupResponseDto,
  DisableTwoFactorDto,
  ValidateTwoFactorDto,
  ValidateTwoFactorResponseDto,
  RegenerateBackupCodesDto,
  RegenerateBackupCodesResponseDto,
} from '../dto/two-factor.dto';

@ApiTags('Admin 2FA')
@UseGuards(AdminThrottlerGuard)
@Controller('auth/2fa')
export class TwoFactorController {
  private readonly logger = new Logger(TwoFactorController.name);

  constructor(
    private readonly twoFactorService: AdminTwoFactorService,
  ) {}

  @Post('setup')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Initiate 2FA setup',
    description: 'Generate TOTP secret and QR code for 2FA setup (authenticated, 2FA not yet enabled)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '2FA setup initiated successfully',
    type: TwoFactorSetupResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: '2FA is already enabled',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing admin token',
  })
  async setup(@Request() req: any): Promise<TwoFactorSetupResponseDto> {
    const adminId = req.user?.sub;
    this.logger.log(`2FA setup requested by admin ${adminId}`);
    return this.twoFactorService.setup(adminId);
  }

  @Post('verify-setup')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirm and enable 2FA',
    description: 'Verify TOTP code and enable 2FA for the admin account',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '2FA enabled successfully, backup codes returned',
    type: VerifySetupResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid TOTP code or setup expired',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing admin token',
  })
  async verifySetup(
    @Request() req: any,
    @Body() dto: VerifySetupDto,
  ): Promise<VerifySetupResponseDto> {
    const adminId = req.user?.sub;
    this.logger.log(`2FA verify-setup requested by admin ${adminId}`);
    return this.twoFactorService.verifySetup(adminId, dto.totpCode);
  }

  @Post('disable')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Disable 2FA',
    description: 'Disable 2FA for the admin account (requires TOTP code and password). Not allowed for SUPER_ADMIN and FINANCE_ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '2FA disabled successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid TOTP code or password',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: '2FA is mandatory for this role',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing admin token',
  })
  async disable(
    @Request() req: any,
    @Body() dto: DisableTwoFactorDto,
  ): Promise<void> {
    const adminId = req.user?.sub;
    this.logger.log(`2FA disable requested by admin ${adminId}`);
    await this.twoFactorService.disable(adminId, dto.totpCode, dto.password);
  }

  @Post('validate')
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Validate TOTP during login',
    description: 'Complete login by validating TOTP code or backup code (step 2 of 2FA login)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '2FA validated successfully, full access token returned',
    type: ValidateTwoFactorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid TOTP code or backup code',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired 2FA token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Too many failed 2FA attempts, account locked',
  })
  async validate(
    @Body() dto: ValidateTwoFactorDto,
  ): Promise<ValidateTwoFactorResponseDto> {
    this.logger.log('2FA validation requested');
    return this.twoFactorService.validate(
      dto.twoFactorToken,
      dto.totpCode,
      dto.backupCode,
    );
  }

  @Post('regenerate-backup-codes')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Regenerate backup codes',
    description: 'Generate new backup codes and invalidate old ones (requires TOTP verification)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Backup codes regenerated successfully',
    type: RegenerateBackupCodesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid TOTP code or 2FA not enabled',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing admin token',
  })
  async regenerateBackupCodes(
    @Request() req: any,
    @Body() dto: RegenerateBackupCodesDto,
  ): Promise<RegenerateBackupCodesResponseDto> {
    const adminId = req.user?.sub;
    this.logger.log(`Backup codes regeneration requested by admin ${adminId}`);
    return this.twoFactorService.regenerateBackupCodes(adminId, dto.totpCode);
  }
}
