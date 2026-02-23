import { DataSource, EntityManager } from 'typeorm';
import {
  BankDetails,
  Merchant,
  MerchantStatus,
  KycStatus,
  BankAccountStatus,
} from './entities/merchant.entity';
import {
  encryptBankDetails,
  decryptBankDetails,
  MerchantRepository,
} from './repositories/merchant.repository';

// ─── Encryption helpers ────────────────────────────────────────────────────

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('Bank details encryption', () => {
  const original: BankDetails = {
    accountName: 'Acme Corp',
    accountNumber: '0123456789',
    bankName: 'First National Bank',
    routingNumber: '021000021',
  };

  beforeEach(() => {
    process.env.BANK_DETAILS_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.BANK_DETAILS_ENCRYPTION_KEY;
  });

  it('encrypts bank details to a non-plaintext string', () => {
    const ciphertext = encryptBankDetails(original);
    expect(ciphertext).not.toContain('Acme Corp');
    expect(ciphertext).not.toContain('0123456789');
    expect(ciphertext.split(':')).toHaveLength(3); // iv:authTag:data
  });

  it('round-trips: decrypt(encrypt(x)) === x', () => {
    const ciphertext = encryptBankDetails(original);
    const decrypted = decryptBankDetails(ciphertext);
    expect(decrypted).toEqual(original);
  });

  it('different encryptions of same data produce different ciphertexts (random IV)', () => {
    const c1 = encryptBankDetails(original);
    const c2 = encryptBankDetails(original);
    expect(c1).not.toBe(c2);
    expect(decryptBankDetails(c1)).toEqual(decryptBankDetails(c2));
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = encryptBankDetails(original);
    const parts = ciphertext.split(':');
    parts[2] = parts[2].replace('a', 'b').replace('0', '1'); // corrupt data
    expect(() => decryptBankDetails(parts.join(':'))).toThrow();
  });

  it('throws on invalid ciphertext format', () => {
    expect(() => decryptBankDetails('not:valid')).toThrow(
      'Invalid ciphertext format',
    );
    expect(() => decryptBankDetails('no_colons_at_all')).toThrow();
  });

  it('throws when encryption key is missing', () => {
    delete process.env.BANK_DETAILS_ENCRYPTION_KEY;
    expect(() => encryptBankDetails(original)).toThrow(
      'BANK_DETAILS_ENCRYPTION_KEY',
    );
  });

  it('throws when encryption key is wrong length', () => {
    process.env.BANK_DETAILS_ENCRYPTION_KEY = 'tooshort';
    expect(() => encryptBankDetails(original)).toThrow(
      'BANK_DETAILS_ENCRYPTION_KEY',
    );
  });
});

// ─── MerchantRepository unit tests ───────────────────────────────────────────

describe('MerchantRepository', () => {
  let repo: MerchantRepository;

  const mockManager: Partial<EntityManager> = {
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findOneOrFail: jest.fn(),
  };

  const mockDataSource = {
    createEntityManager: jest.fn().mockReturnValue(mockManager),
  } as unknown as DataSource;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BANK_DETAILS_ENCRYPTION_KEY = VALID_KEY;
    repo = new MerchantRepository(mockDataSource);
    // Override repository methods directly
    repo.findOne = jest.fn();
    repo.find = jest.fn();
    repo.create = jest.fn();
    repo.save = jest.fn();
    repo.softDelete = jest.fn();
    repo.delete = jest.fn();
    repo.findOneOrFail = jest.fn();
  });

  afterEach(() => {
    delete process.env.BANK_DETAILS_ENCRYPTION_KEY;
  });

  const makeMerchant = (overrides: Partial<Merchant> = {}): Merchant =>
    ({
      id: 'merch-001',
      name: 'Acme Ltd',
      email: 'acme@example.com',
      status: MerchantStatus.ACTIVE,
      kycStatus: KycStatus.APPROVED,
      bankAccountStatus: BankAccountStatus.PENDING,
      settings: {},
      flags: [],
      apiQuotaUsed: 0,
      ipAllowlistEnforced: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Merchant;

  // ── findByEmail ──────────────────────────────────────────────────────────

  it('findByEmail returns merchant by email', async () => {
    const m = makeMerchant();
    (repo.findOne as jest.Mock).mockResolvedValue(m);

    const result = await repo.findByEmail('acme@example.com');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'acme@example.com' },
    });
    expect(result?.email).toBe('acme@example.com');
  });

  it('findByEmail returns null when not found', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);

    const result = await repo.findByEmail('unknown@example.com');
    expect(result).toBeNull();
  });

  // ── createMerchant ────────────────────────────────────────────────────────

  it('createMerchant saves merchant without bank details', async () => {
    const m = makeMerchant();
    (repo.create as jest.Mock).mockReturnValue(m);
    (repo.save as jest.Mock).mockResolvedValue(m);

    const result = await repo.createMerchant({
      name: 'Acme Ltd',
      email: 'acme@example.com',
    } as any);

    expect(result.id).toBe('merch-001');
    expect(result.bankDetailsEncrypted).toBeUndefined();
  });

  it('createMerchant encrypts bank details on save', async () => {
    const m = makeMerchant();
    (repo.create as jest.Mock).mockReturnValue(m);
    (repo.save as jest.Mock).mockImplementation(async (entity) => entity);

    const bankDetails: BankDetails = {
      accountName: 'Acme Corp',
      accountNumber: '9876543210',
      bankName: 'City Bank',
    };

    const result = await repo.createMerchant(
      { name: 'Acme Ltd' } as any,
      bankDetails,
    );

    expect(result.bankDetailsEncrypted).toBeDefined();
    expect(result.bankDetailsEncrypted).not.toContain('9876543210');
    const decrypted = decryptBankDetails(result.bankDetailsEncrypted!);
    expect(decrypted.accountNumber).toBe('9876543210');
  });

  // ── updateMerchant ────────────────────────────────────────────────────────

  it('updateMerchant sets updatedBy audit field', async () => {
    const m = makeMerchant();
    (repo.findOneOrFail as jest.Mock).mockResolvedValue(m);
    (repo.save as jest.Mock).mockImplementation(async (e) => e);

    const result = await repo.updateMerchant(
      'merch-001',
      { name: 'New Name' },
      undefined,
      'admin-001',
    );

    expect(result.name).toBe('New Name');
    expect(result.updatedBy).toBe('admin-001');
  });

  // ── softDelete ────────────────────────────────────────────────────────────

  it('softDeleteMerchant calls softDelete with id', async () => {
    (repo.softDelete as jest.Mock).mockResolvedValue(undefined);

    await repo.softDeleteMerchant('merch-001');

    expect(repo.softDelete).toHaveBeenCalledWith('merch-001');
  });

  // ── KYC helpers ───────────────────────────────────────────────────────────

  it('approveKyc sets status APPROVED and kycVerifiedAt', async () => {
    const m = makeMerchant({ kycStatus: KycStatus.IN_REVIEW });
    (repo.findOneOrFail as jest.Mock).mockResolvedValue(m);
    (repo.save as jest.Mock).mockImplementation(async (e) => e);

    const result = await repo.approveKyc('merch-001', 'admin-002');

    expect(result.kycStatus).toBe(KycStatus.APPROVED);
    expect(result.kycVerifiedAt).toBeInstanceOf(Date);
    expect(result.status).toBe(MerchantStatus.ACTIVE);
  });

  it('rejectKyc sets REJECTED status with reason', async () => {
    const m = makeMerchant({ kycStatus: KycStatus.IN_REVIEW });
    (repo.findOneOrFail as jest.Mock).mockResolvedValue(m);
    (repo.save as jest.Mock).mockImplementation(async (e) => e);

    const result = await repo.rejectKyc(
      'merch-001',
      'Fake documents',
      'admin-002',
    );

    expect(result.kycStatus).toBe(KycStatus.REJECTED);
    expect(result.kycRejectionReason).toBe('Fake documents');
  });

  // ── Status transitions ────────────────────────────────────────────────────

  it('suspend sets SUSPENDED status and suspendedAt', async () => {
    const m = makeMerchant({ status: MerchantStatus.ACTIVE });
    (repo.findOneOrFail as jest.Mock).mockResolvedValue(m);
    (repo.save as jest.Mock).mockImplementation(async (e) => e);

    const result = await repo.suspend('merch-001', 'admin-001');

    expect(result.status).toBe(MerchantStatus.SUSPENDED);
    expect(result.suspendedAt).toBeInstanceOf(Date);
  });

  it('close sets CLOSED status and closedAt', async () => {
    const m = makeMerchant({ status: MerchantStatus.SUSPENDED });
    (repo.findOneOrFail as jest.Mock).mockResolvedValue(m);
    (repo.save as jest.Mock).mockImplementation(async (e) => e);

    const result = await repo.close('merch-001', 'admin-001');

    expect(result.status).toBe(MerchantStatus.CLOSED);
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  // ── Bank details ──────────────────────────────────────────────────────────

  it('getBankDetails returns null for merchant with no encrypted field', () => {
    const m = makeMerchant({ bankDetailsEncrypted: undefined });
    expect(repo.getBankDetails(m)).toBeNull();
  });

  it('getBankDetails decrypts correctly', () => {
    const bd: BankDetails = {
      accountName: 'Test',
      accountNumber: '1234',
      bankName: 'BNK',
    };
    const m = makeMerchant({ bankDetailsEncrypted: encryptBankDetails(bd) });
    const result = repo.getBankDetails(m);
    expect(result?.accountNumber).toBe('1234');
  });
});
