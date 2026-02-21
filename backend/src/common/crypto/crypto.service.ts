import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    // Ensure key is 32 bytes for AES-256
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * @param plaintext - The text to encrypt
   * @returns Encrypted string in format "iv:authTag:ciphertext" (base64)
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
      ciphertext += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      // Return format: iv:authTag:ciphertext (all base64)
      return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypts ciphertext encrypted with AES-256-GCM
   * @param ciphertext - Encrypted string in format "iv:authTag:ciphertext" (base64)
   * @returns Decrypted plaintext
   */
  decrypt(ciphertext: string): string {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }

      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      const encryptedData = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let plaintext = decipher.update(encryptedData, 'base64', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generates backup codes in format "XXXX-XXXX-XXXX"
   * @param count - Number of backup codes to generate (default: 10)
   * @returns Array of backup codes
   */
  generateBackupCodes(count = 10): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
      
      codes.push(`${part1}-${part2}-${part3}`);
    }
    
    return codes;
  }

  /**
   * Hashes a backup code using bcrypt
   * @param code - The backup code to hash
   * @returns Bcrypt hash of the code
   */
  async hashBackupCode(code: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(code, saltRounds);
  }

  /**
   * Verifies a backup code against a hash
   * @param code - The backup code to verify
   * @param hash - The bcrypt hash to compare against
   * @returns True if the code matches the hash
   */
  async verifyBackupCode(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }
}
