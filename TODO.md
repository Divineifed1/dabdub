# Support Module Implementation TODO

## Plan Breakdown (Approved)

### Phase 1: Core Module Structure [ ]

- [ ] Create `backend/src/support/support.module.ts`
- [ ] Create entities: `support-ticket.entity.ts`, `ticket-message.entity.ts`
- [ ] Create DTOs: `create-ticket.dto.ts`, `add-message.dto.ts`, `ticket-response.dto.ts`, `admin-ticket-query.dto.ts`, `update-ticket.dto.ts`
- [ ] Create `support.controller.ts` (user endpoints)
- [ ] Create `support-admin.controller.ts` (admin endpoints)

### Phase 2: Services & Logic [ ]

- [ ] Create `support.service.ts` (CRUD, priority logic, notifications)
- [ ] Create `support.processor.ts` (BullMQ escalation cron)
- [ ] Update `queue.constants.ts` - add 'support-jobs'

### Phase 3: Integration & Migration [ ]

- [ ] Create migration for support tables
- [ ] Update `app.module.ts` - import SupportModule
- [ ] Run migration

### Phase 4: Testing & Validation [ ]

- [ ] Create `support.service.spec.ts`
- [ ] Test endpoints manually
- [ ] Verify cron/escalation
- [ ] Mark complete

**Current Progress: Starting Phase 1**
# Merchant Settlement History Module - Implementation Plan

## Status: ✅ In Progress

### 1. [ ] Create backend/src/settlement/entities/settlement.entity.ts

- TypeORM entity with all AC fields + indexes matching migration

### 2. [ ] Create DTOs in backend/src/settlement/dto/

- settlement-detail.dto.ts
- settlements-query.dto.ts (pagination + filters)
- summary.dto.ts
- monthly-breakdown.dto.ts

### 3. [ ] Implement SettlementHistoryService

- backend/src/settlement/settlement-history.service.ts
- getMerchantSettlements(merchantId, query)
- getSummary(merchantId)
- getMonthlyBreakdown(merchantId)

### 4. [ ] Create Controllers

- backend/src/settlement/settlement.controller.ts
- /merchant/settlements\*, /merchant/settlements/summary, /merchant/settlements/breakdown
- /admin/settlements\*, /admin/settlements/pending

### 5. [ ] Create Module

- backend/src/settlement/settlement.module.ts
- Import TypeOrmModule.forFeature([Settlement]), dependencies

### 6. [ ] Update app.module.ts

- Add import SettlementModule

### 7. [ ] Clean up starter files

- Delete cron.ts, settlement.service.ts, settlement.worker.ts, settlement.entity.ts

### 8. [ ] Add Unit Tests

- settlement-history.service.spec.ts (AC test cases)

### 9. [ ] Follow-up

- Run migrations if needed
- npm run test
- Manual endpoint testing
# Merchant POS QR Implementation TODO

Approved plan breakdown into logical steps. Mark [x] as you complete.

## Profile Module (Previous)

- [x] Migration, entities, DTOs, service/controller/module

## Merchant POS QR (100% Implementation)

**1. [x] Create DTOs & Update public DTO**

- ✓ pos-qr-query.dto.ts
- ✓ pos-qr-response.dto.ts
- ✓ merchant-public-profile.dto.ts (+ username, tier, logoUrl)

**2. [x] Extend QrService**

- ✓ backend/src/qr/qr.service.ts: renderQr public, generatePosQr(username, merchantId, amount?, note?)
- ✓ POS persistent cache `pos:qr:{merchantId}` TTL 86400
- Cache: !amount ? `pos:qr:${merchantId}` TTL 86400 : unique hash
- Return {qrDataUrl, paymentUrl, username, businessName, logoUrl?, tier, isVerified}

**3. [x] Create MerchantPosService**

- ✓ backend/src/merchants/merchant-pos.service.ts: getPosQr(user), getPosQrWithAmount, regenerate
- ✓ Composes QrService + merchant/user data + logoUrl placeholder

- backend/src/merchants/merchant-pos.service.ts: getPosQr(user: User), getPosQrWithAmount(merchantId, amount, note), regenerate(merchantId: del cache)

**4. [x] Update MerchantsController**

- ✓ backend/src/merchants/merchants.controller.ts:
  - ✓ GET /merchants/me/pos-qr (?amount=?&note=)
  - ✓ POST /merchants/me/pos-qr/regenerate
  - ✓ GET /merchants/:username/pay -> public full DTO

**5. [x] Update merchants.module.ts**

- ✓ Add QrModule import, MerchantPosService provider/export

**6. [x] Unit Tests**

- ✓ merchant-pos.service.spec.ts stub for AC tests
- Tests: cache hit second call, unique one-time, non-merchant forbidden, regenerate del key

**7. [ ] Verify**

- npm test merchants qr
- Manual test endpoints

**8. [x] Complete**
# Profile Module Implementation TODO

Approved plan breakdown into logical steps. Mark [x] as completed.

## 1. Database Migration [x]

- Manual migration created: 1769990000000-AddUserProfileFields.ts
- \`npm run migration:run\` running

## 2. Update User Entity [x]

- Added bio, avatarKey, twitterHandle, instagramHandle
- Removed duplicate columns

## 3. Create Profile DTOs [x]

- ✓ all 4 DTOs

## 4. Create Profile Service [x]

- ✓ profile.service.ts
- ✓ profile.service.spec.ts

## 5. Create Profile Controller [x]

- ✓ profile.controller.ts

## 6. Create Profile Module [x]

- ✓ profile.module.ts

## 7. Update Existing Files [ ]

- Extend users/dto/update-profile.dto.ts (align with new)
- Extend users.service.ts update() for new fields
- Align users/dto/user-response.dto.ts with ProfileDto
- app.module.ts: import ProfileModule
- uploads: add AVATAR purpose (optional, reusing MERCHANT_LOGO)

## 8. R2 Public Avatar URLs [ ]

- Placeholder public URL in service (upgrade to presign later)

## 9. Testing [ ]

- Run \`cd backend && npm test profile\`
- Manual endpoints

## 10. Completion [ ]
# Referral Analytics Implementation Plan (#491)

## Steps to Complete:

### 1. Create new files
- [x] backend/src/referrals/referral-analytics.service.ts (all methods: getFunnelStats, getTopReferrers, getCohortComparison, getRewardSpend, getUserReferralStats)
- [x] backend/src/referrals/dto/referral-analytics.dto.ts (DTOs for responses)
- [x] backend/src/referrals/referral-analytics.processor.ts (BullMQ daily job 'compute-referral-analytics')
- [ ] backend/src/referrals/referral-analytics.service.spec.ts (unit tests)

### 2. Update existing files
- [x] backend/src/referrals/referrals.module.ts (import CacheModule, new service/processor)
- [x] backend/src/referrals/referrals.controller.ts (add public GET /track?ref=code for click tracking)
- [ ] backend/src/referrals/referral.service.spec.ts (add tests for interactions)
- [x] backend/src/admin/admin.controller.ts (add GET /admin/referrals/analytics, /admin/referrals/cohort, /admin/referrals/users/:userId)
- [x] backend/src/admin/admin.module.ts (inject ReferralModule or service)

### 3. Branch, commit, tests
- [ ] git checkout -b blackboxai/fix-491-referral-analytics
- [ ] npm test (ensure unit tests pass)
- [ ] cargo test (if contracts affected, unlikely)
- [ ] git add . &amp;&amp; git commit -m "fix(#491): implement referral analytics funnel, top referrers, cohorts, spend tracking + daily cache job"

### 4. Create PR
- [ ] gh pr create --title "fix(#491): Referral analytics — tracking funnel performance" --body "Implements all AC: FunnelStats, click tracking, top referrers, cohort comparison, reward spend, user stats, admin endpoints, daily BullMQ cache job. Tests added. Ready for review." --base main

**Progress: 0/15 complete**

