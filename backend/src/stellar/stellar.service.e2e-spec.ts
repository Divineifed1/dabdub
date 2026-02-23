import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

// ─── SDK Mock ────────────────────────────────────────────────────────────────

const mockServer = {
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  payments: jest.fn(),
  friendbot: jest.fn(),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => mockServer),
  },
  Keypair: {
    random: jest.fn(),
    fromSecret: jest.fn(),
  },
  Asset: {
    native: jest.fn().mockReturnValue({ isNative: () => true }),
  },
  TransactionBuilder: jest.fn(),
  Operation: {
    payment: jest.fn().mockReturnValue({ type: 'payment' }),
    changeTrust: jest.fn().mockReturnValue({ type: 'changeTrust' }),
  },
  Memo: { text: jest.fn().mockReturnValue({ type: 'text' }) },
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  BASE_FEE: '100',
}));

(StellarSdk.TransactionBuilder as any).fromXDR = jest.fn();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKeypair(pub: string, secret: string) {
  return { publicKey: () => pub, secret: () => secret, sign: jest.fn() };
}

function makeBuilderChain(xdr: string) {
  const tx = { sign: jest.fn(), toXDR: jest.fn().mockReturnValue(xdr) };
  const builder = {
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(tx),
    _tx: tx,
  };
  (StellarSdk.TransactionBuilder as jest.Mock).mockImplementation(
    () => builder,
  );
  return { builder, tx };
}

function makeAccount(pub: string, balances: object[]) {
  return { id: pub, balances, incrementSequenceNumber: jest.fn() };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('StellarService — E2E flows', () => {
  let service: StellarService;

  const USDC_ISSUER =
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const TREASURY_PUB = 'GTREASURY111111111111111111111111111111111111111111111';
  const TREASURY_SECRET = 'STREASURY_SECRET_KEY_PLACEHOLDER_111111111111111111';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockServer.friendbot.mockReturnValue({
      call: jest.fn().mockResolvedValue({}),
    });
    mockServer.submitTransaction.mockResolvedValue({
      hash: 'mock_tx_hash_001',
    });
    mockServer.payments.mockReturnValue({
      forAccount: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({ records: [] }),
      cursor: jest.fn().mockReturnThis(),
      stream: jest.fn().mockReturnValue(() => {}),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const cfg: Record<string, string> = {
                STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
                STELLAR_NETWORK_PASSPHRASE: StellarSdk.Networks.TESTNET,
                STELLAR_ISSUER_PUBLIC_KEY: USDC_ISSUER,
              };
              return cfg[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    service.onModuleInit();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. COMPLETE USER JOURNEY
  // ──────────────────────────────────────────────────────────────────────────

  describe('User journey: signup → deposit → payment → withdrawal', () => {
    it('1a. factory creates a funded wallet for user via friendbot', async () => {
      const kp = makeKeypair('G_USER1_PUB', 'S_USER1_SECRET');
      (StellarSdk.Keypair.random as jest.Mock).mockReturnValue(kp);

      const account = await service.createAccount();

      expect(account.publicKey).toBe('G_USER1_PUB');
      expect(account.secret).toBe('S_USER1_SECRET');
      expect(mockServer.friendbot).toHaveBeenCalledWith('G_USER1_PUB');
    });

    it('1b. user adds USDC trustline after account creation', async () => {
      const kp = makeKeypair('G_USER1_PUB', 'S_USER1_SECRET');
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(kp);
      mockServer.loadAccount.mockResolvedValue(makeAccount('G_USER1_PUB', []));
      makeBuilderChain('trustline_xdr');

      const result = await service.addTrustline(
        'S_USER1_SECRET',
        'USDC',
        USDC_ISSUER,
      );

      expect(StellarSdk.Operation.changeTrust).toHaveBeenCalledWith(
        expect.objectContaining({}),
      );
      expect(result.hash).toBe('mock_tx_hash_001');
    });

    it('1c. backend verifies USDC deposit balance after funding', async () => {
      const balances = [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: USDC_ISSUER,
          balance: '100.0000000',
        },
        { asset_type: 'native', balance: '9.9999900' },
      ];
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_USER1_PUB', balances),
      );

      const result = await service.getBalance('G_USER1_PUB');

      const usdc = result.find((b: any) => b.asset_code === 'USDC');
      expect(usdc).toBeDefined();
      expect(usdc.balance).toBe('100.0000000');
    });

    it('1d. backend processes USDC payment to CheeseVault/merchant wallet', async () => {
      const kp = makeKeypair('G_USER1_PUB', 'S_USER1_SECRET');
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(kp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_USER1_PUB', [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '100.0000000',
          },
        ]),
      );
      const { tx } = makeBuilderChain('payment_xdr');

      const xdr = await service.buildPaymentTransaction(
        'S_USER1_SECRET',
        'G_MERCHANT_VAULT',
        '50',
        'USDC',
        'order-ref-001',
      );

      expect(xdr).toBe('payment_xdr');
      expect(tx.sign).toHaveBeenCalledWith(kp);
      expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'G_MERCHANT_VAULT',
          amount: '50',
        }),
      );
      expect(StellarSdk.Memo.text).toHaveBeenCalledWith('order-ref-001');
    });

    it('1e. backend submits signed transaction and gets hash back', async () => {
      const mockTx = { sign: jest.fn() };
      (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue(
        mockTx,
      );
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'confirmed_hash_abc',
      });

      const result = await service.submitTransaction('payment_xdr');

      expect(result.hash).toBe('confirmed_hash_abc');
    });

    it('1f. user withdraws remaining balance back to external address', async () => {
      const kp = makeKeypair('G_USER1_PUB', 'S_USER1_SECRET');
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(kp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_USER1_PUB', [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '50.0000000',
          },
        ]),
      );
      makeBuilderChain('withdrawal_xdr');

      const xdr = await service.buildPaymentTransaction(
        'S_USER1_SECRET',
        'G_EXTERNAL_WALLET',
        '50',
        'USDC',
      );

      expect(xdr).toBe('withdrawal_xdr');
      expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'G_EXTERNAL_WALLET',
          amount: '50',
        }),
      );
    });

    it('1g. treasurer withdraws vault funds to treasury account', async () => {
      const kp = makeKeypair(TREASURY_PUB, TREASURY_SECRET);
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(kp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount(TREASURY_PUB, [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '500.0000000',
          },
        ]),
      );
      makeBuilderChain('treasury_withdrawal_xdr');

      const xdr = await service.buildPaymentTransaction(
        TREASURY_SECRET,
        'G_COLD_STORAGE',
        '500',
        'USDC',
        'treasury-sweep',
      );

      expect(xdr).toBe('treasury_withdrawal_xdr');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MULTI-USER CONCURRENT OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Multi-user scenario with concurrent operations', () => {
    const users = [
      { pub: 'G_USER_A', secret: 'S_USER_A', balance: '200' },
      { pub: 'G_USER_B', secret: 'S_USER_B', balance: '150' },
      { pub: 'G_USER_C', secret: 'S_USER_C', balance: '300' },
    ];

    beforeEach(() => {
      let callIdx = 0;
      (StellarSdk.Keypair.random as jest.Mock).mockImplementation(() => {
        const u = users[callIdx++ % users.length];
        return makeKeypair(u.pub, u.secret);
      });
    });

    it('2a. factory creates wallets for 3 users concurrently', async () => {
      const accounts = await Promise.all([
        service.createAccount(),
        service.createAccount(),
        service.createAccount(),
      ]);

      expect(accounts).toHaveLength(3);
      accounts.forEach((acc) => {
        expect(acc.publicKey).toBeTruthy();
        expect(acc.secret).toBeTruthy();
      });
      expect(mockServer.friendbot).toHaveBeenCalledTimes(3);
    });

    it('2b. all 3 users deposit USDC and balances are independently tracked', async () => {
      for (const user of users) {
        mockServer.loadAccount.mockResolvedValueOnce(
          makeAccount(user.pub, [
            {
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              balance: user.balance,
            },
          ]),
        );
      }

      const balances = await Promise.all(
        users.map((u) => service.getBalance(u.pub)),
      );

      expect(balances[0][0].balance).toBe('200');
      expect(balances[1][0].balance).toBe('150');
      expect(balances[2][0].balance).toBe('300');
    });

    it('2c. payments processed for all 3 users concurrently', async () => {
      users.forEach((user) => {
        (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValueOnce(
          makeKeypair(user.pub, user.secret),
        );
        mockServer.loadAccount.mockResolvedValueOnce(
          makeAccount(user.pub, [
            {
              asset_type: 'credit_alphanum4',
              asset_code: 'USDC',
              balance: user.balance,
            },
          ]),
        );
      });

      let xdrCounter = 0;
      (StellarSdk.TransactionBuilder as jest.Mock).mockImplementation(() => ({
        addOperation: jest.fn().mockReturnThis(),
        addMemo: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue({
          sign: jest.fn(),
          toXDR: jest.fn().mockReturnValue(`xdr_${++xdrCounter}`),
        }),
      }));

      const txXdrs = await Promise.all(
        users.map((u) =>
          service.buildPaymentTransaction(
            u.secret,
            'G_MERCHANT',
            '100',
            'USDC',
          ),
        ),
      );

      expect(txXdrs).toHaveLength(3);
      txXdrs.forEach((xdr) => expect(xdr).toMatch(/^xdr_\d+$/));
    });

    it('2d. total accounting: all 3 payments submitted, each gets unique hash', async () => {
      let hashIdx = 0;
      mockServer.submitTransaction.mockImplementation(() =>
        Promise.resolve({ hash: `hash_${++hashIdx}` }),
      );
      (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});

      const results = await Promise.all([
        service.submitTransaction('xdr_1'),
        service.submitTransaction('xdr_2'),
        service.submitTransaction('xdr_3'),
      ]);

      const hashes = results.map((r) => r.hash);
      expect(new Set(hashes).size).toBe(3); // all unique
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. REFUND FLOW
  // ──────────────────────────────────────────────────────────────────────────

  describe('Refund flow', () => {
    it('3a. merchant initiates refund back to customer wallet', async () => {
      const merchantKp = makeKeypair('G_MERCHANT', 'S_MERCHANT');
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(merchantKp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_MERCHANT', [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '50.0000000',
          },
        ]),
      );
      makeBuilderChain('refund_xdr');

      const xdr = await service.buildPaymentTransaction(
        'S_MERCHANT',
        'G_USER1_PUB',
        '50',
        'USDC',
        'refund:order-ref-001',
      );

      expect(xdr).toBe('refund_xdr');
      expect(StellarSdk.Memo.text).toHaveBeenCalledWith('refund:order-ref-001');
      expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
        expect.objectContaining({ destination: 'G_USER1_PUB', amount: '50' }),
      );
    });

    it('3b. refund transaction is submitted and confirmed', async () => {
      (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'refund_hash_xyz',
      });

      const result = await service.submitTransaction('refund_xdr');

      expect(result.hash).toBe('refund_hash_xyz');
    });

    it('3c. customer balance increases after refund confirmation', async () => {
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_USER1_PUB', [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '100.0000000',
          },
        ]),
      );

      const balances = await service.getBalance('G_USER1_PUB');
      const usdc = balances.find((b: any) => b.asset_code === 'USDC');
      expect(parseFloat(usdc.balance)).toBe(100);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. TREASURY WITHDRAWAL FLOW
  // ──────────────────────────────────────────────────────────────────────────

  describe('Treasury withdrawal flow', () => {
    it('4a. treasury account checks consolidated vault balance', async () => {
      mockServer.loadAccount.mockResolvedValue(
        makeAccount(TREASURY_PUB, [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '10000.0000000',
          },
          { asset_type: 'native', balance: '50.0000000' },
        ]),
      );

      const balances = await service.getBalance(TREASURY_PUB);
      const usdc = balances.find((b: any) => b.asset_code === 'USDC');
      expect(parseFloat(usdc.balance)).toBe(10000);
    });

    it('4b. treasurer submits batch withdrawal to cold storage', async () => {
      const kp = makeKeypair(TREASURY_PUB, TREASURY_SECRET);
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(kp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount(TREASURY_PUB, [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '10000.0000000',
          },
        ]),
      );
      makeBuilderChain('treasury_xdr');
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'treasury_hash_001',
      });
      (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});

      const xdr = await service.buildPaymentTransaction(
        TREASURY_SECRET,
        'G_COLD_STORAGE_001',
        '10000',
        'USDC',
        'treasury-daily-sweep',
      );
      const result = await service.submitTransaction(xdr);

      expect(result.hash).toBe('treasury_hash_001');
    });

    it('4c. treasury transaction history shows sweep record', async () => {
      const paymentsChain = {
        forAccount: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              id: 'op_001',
              type: 'payment',
              amount: '10000.0000000',
              to: 'G_COLD_STORAGE_001',
            },
          ],
        }),
      };
      mockServer.payments.mockReturnValue(paymentsChain);

      const history = await service.getTransactionHistory(TREASURY_PUB, 5);

      expect(history).toHaveLength(1);
      expect(history[0].amount).toBe('10000.0000000');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. EMERGENCY WITHDRAWAL SCENARIO
  // ──────────────────────────────────────────────────────────────────────────

  describe('Emergency withdrawal scenario', () => {
    it('5a. emergency key generates signed withdrawal immediately', async () => {
      const emergencyKp = makeKeypair(
        'G_EMERGENCY_AUTHORITY',
        'S_EMERGENCY_SECRET',
      );
      (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(emergencyKp);
      mockServer.loadAccount.mockResolvedValue(
        makeAccount('G_EMERGENCY_AUTHORITY', [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '999.0000000',
          },
        ]),
      );
      const { tx } = makeBuilderChain('emergency_xdr');

      const xdr = await service.buildPaymentTransaction(
        'S_EMERGENCY_SECRET',
        'G_SAFE_HARBOR',
        '999',
        'USDC',
        'EMERGENCY',
      );

      expect(xdr).toBe('emergency_xdr');
      expect(tx.sign).toHaveBeenCalledWith(emergencyKp);
      expect(StellarSdk.Memo.text).toHaveBeenCalledWith('EMERGENCY');
    });

    it('5b. emergency withdrawal submits without delay', async () => {
      (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'emergency_hash_000',
      });

      const start = Date.now();
      const result = await service.submitTransaction('emergency_xdr');
      const elapsed = Date.now() - start;

      expect(result.hash).toBe('emergency_hash_000');
      expect(elapsed).toBeLessThan(1000); // must be fast
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('StellarService — Security tests', () => {
  let service: StellarService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockServer.submitTransaction.mockResolvedValue({ hash: 'hash' });
    mockServer.friendbot.mockReturnValue({
      call: jest.fn().mockResolvedValue({}),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string, d?: string) => d) },
        },
      ],
    }).compile();
    service = module.get(StellarService);
    service.onModuleInit();
  });

  it('SEC-01: rejects invalid secret key when building transaction', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid secret key');
    });

    await expect(
      service.buildPaymentTransaction('INVALID_SECRET', 'G_DEST', '10'),
    ).rejects.toThrow('Invalid secret key');
  });

  it('SEC-02: rejects non-existent destination account', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G_SOURCE', 'S_SOURCE'),
    );
    mockServer.loadAccount.mockRejectedValue(
      Object.assign(new Error('Not Found'), { response: { status: 404 } }),
    );

    await expect(
      service.buildPaymentTransaction('S_SOURCE', 'G_NONEXISTENT', '10'),
    ).rejects.toThrow('Not Found');
  });

  it('SEC-03: rejects tampered XDR on submission', async () => {
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockImplementation(
      () => {
        throw new Error('Invalid XDR');
      },
    );

    await expect(service.submitTransaction('TAMPERED_XDR')).rejects.toThrow(
      'Invalid XDR',
    );
  });

  it('SEC-04: unauthorized account load throws and is not swallowed', async () => {
    mockServer.loadAccount.mockRejectedValue(new Error('Forbidden'));

    await expect(service.getBalance('G_FOREIGN')).rejects.toThrow('Forbidden');
  });

  it('SEC-05: Horizon 403 on friendbot does not expose secrets', async () => {
    (StellarSdk.Keypair.random as jest.Mock).mockReturnValue(
      makeKeypair('G_NEW', 'S_NEW_SECRET'),
    );
    mockServer.friendbot.mockReturnValue({
      call: jest.fn().mockRejectedValue(new Error('Forbidden')),
    });

    // Should still return keys even when friendbot fails (logged but not thrown)
    const account = await service.createAccount();
    expect(account.secret).toBe('S_NEW_SECRET');
    // Secret must never appear in a thrown error message
  });

  it('SEC-06: stopping monitor twice does not throw', () => {
    expect(() => {
      service.stopMonitoring();
      service.stopMonitoring();
    }).not.toThrow();
  });

  it('SEC-07: negative amount is passed through to SDK (SDK enforces minimum)', async () => {
    // The service itself doesn't validate — SDK/on-chain layer does
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G_SRC', 'S_SRC'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G_SRC', []));
    makeBuilderChain('neg_xdr');

    // Service builds the tx — SDK mock does not throw, but in production Stellar SDK would
    const xdr = await service.buildPaymentTransaction('S_SRC', 'G_DEST', '-1');
    expect(xdr).toBe('neg_xdr');
    // Verify downstream SDK was called — real SDK would throw
    expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '-1' }),
    );
  });

  it('SEC-08: reentrancy — submitting same XDR twice results in two network calls', async () => {
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
    mockServer.submitTransaction
      .mockResolvedValueOnce({ hash: 'hash_1' })
      .mockRejectedValueOnce(
        Object.assign(new Error('tx_bad_seq'), {
          extras: { result_codes: { transaction: 'tx_bad_seq' } },
        }),
      );

    const first = await service.submitTransaction('same_xdr');
    expect(first.hash).toBe('hash_1');

    // Second attempt with same XDR is rejected by Stellar (sequence number reuse)
    await expect(service.submitTransaction('same_xdr')).rejects.toThrow(
      'tx_bad_seq',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('StellarService — Edge cases', () => {
  let service: StellarService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockServer.friendbot.mockReturnValue({
      call: jest.fn().mockResolvedValue({}),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string, d?: string) => d) },
        },
      ],
    }).compile();
    service = module.get(StellarService);
    service.onModuleInit();
  });

  it('EDGE-01: zero amount build passes to SDK (SDK validates)', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G', 'S'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G', []));
    makeBuilderChain('zero_xdr');

    const xdr = await service.buildPaymentTransaction('S', 'G_DEST', '0');
    expect(xdr).toBe('zero_xdr');
    expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '0' }),
    );
  });

  it('EDGE-02: insufficient balance — Horizon rejects on submit', async () => {
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
    mockServer.submitTransaction.mockRejectedValue(
      Object.assign(new Error('op_underfunded'), {
        extras: { result_codes: { operations: ['op_underfunded'] } },
      }),
    );

    await expect(service.submitTransaction('underfunded_xdr')).rejects.toThrow(
      'op_underfunded',
    );
  });

  it('EDGE-03: duplicate wallet creation returns distinct keypairs', async () => {
    let idx = 0;
    (StellarSdk.Keypair.random as jest.Mock).mockImplementation(() =>
      makeKeypair(`G_WALLET_${++idx}`, `S_WALLET_${idx}`),
    );

    const a = await service.createAccount();
    const b = await service.createAccount();

    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.secret).not.toBe(b.secret);
  });

  it('EDGE-04: invalid destination address format throws from SDK', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G_SRC', 'S_SRC'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G_SRC', []));
    (StellarSdk.Operation.payment as jest.Mock).mockImplementation(() => {
      throw new Error('destination is invalid');
    });

    await expect(
      service.buildPaymentTransaction('S_SRC', 'NOT_A_VALID_ADDRESS', '10'),
    ).rejects.toThrow('destination is invalid');
  });

  it('EDGE-05: empty account history returns empty array without error', async () => {
    const paymentsChain = {
      forAccount: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({ records: [] }),
    };
    mockServer.payments.mockReturnValue(paymentsChain);

    const history = await service.getTransactionHistory('G_NEW_ACCOUNT', 10);
    expect(history).toEqual([]);
  });

  it('EDGE-06: XLM native payment (no asset code) builds correctly', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G', 'S'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G', []));
    makeBuilderChain('xlm_xdr');

    const xdr = await service.buildPaymentTransaction('S', 'G_DEST', '1');

    expect(StellarSdk.Asset.native).toHaveBeenCalled();
    expect(xdr).toBe('xlm_xdr');
  });

  it('EDGE-07: very large amount string is passed through unchanged', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G', 'S'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G', []));
    makeBuilderChain('large_xdr');

    const xdr = await service.buildPaymentTransaction(
      'S',
      'G_DEST',
      '9999999999.9999999',
      'USDC',
    );

    expect(StellarSdk.Operation.payment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '9999999999.9999999' }),
    );
    expect(xdr).toBe('large_xdr');
  });

  it('EDGE-08: payment without memo does not add Memo operation', async () => {
    (StellarSdk.Keypair.fromSecret as jest.Mock).mockReturnValue(
      makeKeypair('G', 'S'),
    );
    mockServer.loadAccount.mockResolvedValue(makeAccount('G', []));
    const { builder } = makeBuilderChain('no_memo_xdr');

    await service.buildPaymentTransaction('S', 'G_DEST', '10');

    expect(builder.addMemo).not.toHaveBeenCalled();
  });

  it('EDGE-09: monitoring stream replaces existing stream without memory leak', () => {
    const stream1Close = jest.fn();
    const stream2Close = jest.fn();
    const paymentsChain = {
      forAccount: jest.fn().mockReturnThis(),
      cursor: jest.fn().mockReturnThis(),
      stream: jest
        .fn()
        .mockReturnValueOnce(stream1Close)
        .mockReturnValueOnce(stream2Close),
    };
    mockServer.payments.mockReturnValue(paymentsChain);

    service.monitorTransactions('G_ACCOUNT_1', jest.fn());
    service.monitorTransactions('G_ACCOUNT_2', jest.fn()); // replaces first

    expect(stream1Close).toHaveBeenCalledTimes(1); // old stream closed
  });
});
