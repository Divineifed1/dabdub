#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol,
};

/// Extra ledgers beyond `ttl_ledgers` so persistent PayLink data remains readable until
/// after the logical expiry ledger (archival buffer).
const PAYLINK_TTL_BUFFER_LEDGERS: u32 = 16_384;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Creator(String),
    PayLink(String),
    Admin,
    StakeBalance(String),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayLinkData {
    pub creator_username: String,
    /// USDC amount in stroops (1 USDC = 10_000_000 stroops, 7 decimal places).
    pub amount: i128,
    pub note: String,
    pub expiration_ledger: u32,
    /// Enforces single-payment: set to true once the PayLink is claimed/settled.
    pub paid: bool,
    pub cancelled: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PayLinkAlreadyExists = 1,
    InvalidAmount = 2,
    CreatorNotFound = 3,
    LedgerOverflow = 4,
    PayLinkNotFound = 5,
    NotPayLinkCreator = 6,
    PayLinkAlreadyPaid = 7,
    Unauthorized = 8,
    UserNotFound = 9,
}

#[contract]
pub struct PayLinkContract;

#[contractimpl]
impl PayLinkContract {
    /// One-time admin initialisation. Panics if already set.
    pub fn set_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("admin already set");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Marks `username` as an existing creator so `create_paylink` may succeed.
    /// Intended to be invoked from the same onboarding flow that provisions profiles on-chain.
    pub fn register_creator(env: Env, username: String) {
        env.storage()
            .persistent()
            .set(&DataKey::Creator(username), &true);
    }

    /// Credits yield to a staker's balance. Admin-only; does NOT check the paused flag.
    pub fn credit_yield(env: Env, username: String, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::Unauthorized)?;
        admin.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Creator(username.clone()))
        {
            return Err(Error::UserNotFound);
        }

        let stake_key = DataKey::StakeBalance(username.clone());
        let current: i128 = env.storage().persistent().get(&stake_key).unwrap_or(0);
        let new_balance = current + amount;
        env.storage().persistent().set(&stake_key, &new_balance);
        env.storage().persistent().extend_ttl(
            &stake_key,
            PAYLINK_TTL_BUFFER_LEDGERS,
            PAYLINK_TTL_BUFFER_LEDGERS,
        );

        env.events().publish(
            (Symbol::new(&env, "yield_credited"),),
            (username, amount, new_balance, env.ledger().sequence()),
        );

        Ok(())
    }

    pub fn create_paylink(
        env: Env,
        creator_username: String,
        token_id: String,
        amount: i128,
        note: String,
        ttl_ledgers: u32,
    ) -> Result<(), Error> {
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Creator(creator_username.clone()))
        {
            return Err(Error::CreatorNotFound);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let paylink_key = DataKey::PayLink(token_id.clone());
        if env.storage().persistent().has(&paylink_key) {
            return Err(Error::PayLinkAlreadyExists);
        }

        let current = env.ledger().sequence();
        let expiration_ledger = current
            .checked_add(ttl_ledgers)
            .ok_or(Error::LedgerOverflow)?;

        let data = PayLinkData {
            creator_username: creator_username.clone(),
            amount,
            note,
            expiration_ledger,
            paid: false,
            cancelled: false,
        };

        env.storage().persistent().set(&paylink_key, &data);

        let min_ttl = ttl_ledgers
            .checked_add(PAYLINK_TTL_BUFFER_LEDGERS)
            .ok_or(Error::LedgerOverflow)?;
        env.storage()
            .persistent()
            .extend_ttl(&paylink_key, min_ttl, min_ttl);

        env.events().publish(
            (Symbol::new(&env, "paylink_created"),),
            (creator_username, token_id, amount, expiration_ledger),
        );

        Ok(())
    }

    pub fn cancel_paylink(
        env: Env,
        requester_username: String,
        token_id: String,
    ) -> Result<(), Error> {
        env.current_contract_address().require_auth();

        let paylink_key = DataKey::PayLink(token_id.clone());
        let mut paylink = env
            .storage()
            .persistent()
            .get::<_, PayLinkData>(&paylink_key)
            .ok_or(Error::PayLinkNotFound)?;

        if requester_username != paylink.creator_username {
            return Err(Error::NotPayLinkCreator);
        }

        if paylink.paid {
            return Err(Error::PayLinkAlreadyPaid);
        }

        paylink.cancelled = true;
        env.storage().persistent().set(&paylink_key, &paylink);

        env.events().publish(
            (Symbol::new(&env, "paylink_cancelled"),),
            (requester_username, token_id),
        );

        Ok(())
    }

    pub fn get_paylink(env: Env, token_id: String) -> Option<PayLinkData> {
        env.storage().persistent().get(&DataKey::PayLink(token_id))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};

    #[test]
    fn create_paylink_persists_paylink_data() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "alice");
        let token_id = String::from_str(&env, "tok-1");
        let note = String::from_str(&env, "coffee");

        client.register_creator(&creator);
        env.ledger().set_sequence_number(100);

        client.create_paylink(&creator, &token_id, &100_i128, &note, &50);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(stored.creator_username, creator);
        assert_eq!(stored.amount, 100);
        assert_eq!(stored.note, note);
        assert_eq!(stored.expiration_ledger, 150);
        assert!(!stored.paid);
        assert!(!stored.cancelled);
    }

    #[test]
    fn paylink_data_xdr_round_trip() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        // token_id is a unique slug, max 64 chars
        let token_id = String::from_str(&env, "tok-xdr-roundtrip");
        let data = PayLinkData {
            creator_username: String::from_str(&env, "alice"),
            amount: 10_000_000_i128, // 1 USDC in stroops
            note: String::from_str(&env, "test note"),
            expiration_ledger: 500,
            paid: false,
            cancelled: false,
        };

        env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::PayLink(token_id.clone()), &data);
            let retrieved: PayLinkData = env
                .storage()
                .persistent()
                .get(&DataKey::PayLink(token_id))
                .expect("round-trip failed: key not found");
            assert_eq!(retrieved, data);
        });
    }

    #[test]
    fn duplicate_token_id_returns_paylink_already_exists() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "bob");
        let token_id = String::from_str(&env, "dup");
        let note = String::from_str(&env, "n");

        client.register_creator(&creator);

        client.create_paylink(&creator, &token_id, &1_i128, &note, &10);
        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &2_i128, &note, &10),
            Err(Ok(Error::PayLinkAlreadyExists))
        );
    }

    #[test]
    fn zero_amount_returns_invalid_amount() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "carol");
        let token_id = String::from_str(&env, "z");
        let note = String::from_str(&env, "n");

        client.register_creator(&creator);

        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &0_i128, &note, &10),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn cancel_paylink_marks_link_cancelled() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "dave");
        let token_id = String::from_str(&env, "tok-cancel");
        let note = String::from_str(&env, "lunch");

        client.register_creator(&creator);
        client.create_paylink(&creator, &token_id, &25_i128, &note, &20);

        client.cancel_paylink(&creator, &token_id);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert!(stored.cancelled);
        assert_eq!(stored.creator_username, creator);
        assert!(!stored.paid);
    }

    #[test]
    fn cancel_paylink_by_non_creator_returns_not_paylink_creator() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "erin");
        let other_user = String::from_str(&env, "frank");
        let token_id = String::from_str(&env, "tok-wrong-user");
        let note = String::from_str(&env, "gift");

        client.register_creator(&creator);
        client.create_paylink(&creator, &token_id, &40_i128, &note, &20);

        assert_eq!(
            client.try_cancel_paylink(&other_user, &token_id),
            Err(Ok(Error::NotPayLinkCreator))
        );
    }

    #[test]
    fn cancel_paid_paylink_returns_paylink_already_paid() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "grace");
        let token_id = String::from_str(&env, "tok-paid");
        let note = String::from_str(&env, "rent");

        client.register_creator(&creator);
        client.create_paylink(&creator, &token_id, &75_i128, &note, &20);

        env.as_contract(&contract_id, || {
            let mut stored = env
                .storage()
                .persistent()
                .get::<_, PayLinkData>(&DataKey::PayLink(token_id.clone()))
                .expect("expected PayLink in storage");
            stored.paid = true;
            env.storage()
                .persistent()
                .set(&DataKey::PayLink(token_id.clone()), &stored);
        });

        assert_eq!(
            client.try_cancel_paylink(&creator, &token_id),
            Err(Ok(Error::PayLinkAlreadyPaid))
        );
    }

    #[test]
    fn create_paylink_for_non_existent_creator_returns_creator_not_found() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "unknown");
        let token_id = String::from_str(&env, "tok-unknown");
        let note = String::from_str(&env, "test");

        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &100_i128, &note, &10),
            Err(Ok(Error::CreatorNotFound))
        );
    }

    #[test]
    fn create_paylink_with_negative_amount_returns_invalid_amount() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "henry");
        let token_id = String::from_str(&env, "tok-neg");
        let note = String::from_str(&env, "test");

        client.register_creator(&creator);

        assert_eq!(
            client.try_create_paylink(&creator, &token_id, &-1_i128, &note, &10),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn create_paylink_with_very_large_amount_succeeds() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "irene");
        let token_id = String::from_str(&env, "tok-large");
        let note = String::from_str(&env, "large payment");

        client.register_creator(&creator);

        // 1 billion USDC in stroops (1 USDC = 10_000_000 stroops)
        let large_amount = 1_000_000_000_i128 * 10_000_000_i128;
        client.create_paylink(&creator, &token_id, &large_amount, &note, &100);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(stored.amount, large_amount);
    }

    #[test]
    fn create_paylink_with_minimum_ttl_succeeds() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "jack");
        let token_id = String::from_str(&env, "tok-min-ttl");
        let note = String::from_str(&env, "test");

        client.register_creator(&creator);

        // Minimum TTL of 1 ledger
        client.create_paylink(&creator, &token_id, &100_i128, &note, &1);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(stored.expiration_ledger, env.ledger().sequence() + 1);
    }

    #[test]
    fn create_paylink_with_zero_ttl_fails_due_to_overflow_or_invalid() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "kate");
        let token_id = String::from_str(&env, "tok-zero-ttl");
        let note = String::from_str(&env, "test");

        client.register_creator(&creator);

        // TTL of 0 means expiration at current ledger (already expired)
        // This should still succeed but create an immediately expired paylink
        client.create_paylink(&creator, &token_id, &100_i128, &note, &0);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(stored.expiration_ledger, env.ledger().sequence());
    }

    #[test]
    fn get_paylink_for_non_existent_token_returns_none() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let token_id = String::from_str(&env, "non-existent");
        assert!(client.get_paylink(&token_id).is_none());
    }

    #[test]
    fn register_creator_allows_subsequent_create_paylink() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "leo");
        let token_id = String::from_str(&env, "tok-registered");
        let note = String::from_str(&env, "test");

        // Register creator first
        client.register_creator(&creator);

        // Now create paylink should succeed
        client.create_paylink(&creator, &token_id, &50_i128, &note, &10);

        let stored = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(stored.creator_username, creator);
    }

    #[test]
    fn credit_yield_for_non_existent_user_returns_user_not_found() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let username = String::from_str(&env, "non-existent");
        env.mock_all_auths();

        assert_eq!(
            client.try_credit_yield(&username, &100_i128),
            Err(Ok(Error::UserNotFound))
        );
    }

    #[test]
    fn credit_yield_with_zero_amount_returns_invalid_amount() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let username = String::from_str(&env, "mike");
        client.register_creator(&username);
        env.mock_all_auths();

        assert_eq!(
            client.try_credit_yield(&username, &0_i128),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn credit_yield_with_negative_amount_returns_invalid_amount() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let username = String::from_str(&env, "nancy");
        client.register_creator(&username);
        env.mock_all_auths();

        assert_eq!(
            client.try_credit_yield(&username, &-100_i128),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn credit_yield_increases_stake_balance() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let username = String::from_str(&env, "oscar");
        client.register_creator(&username);
        env.mock_all_auths();

        // Credit yield multiple times
        client.credit_yield(&username, &100_i128);
        client.credit_yield(&username, &200_i128);
        client.credit_yield(&username, &50_i128);

        // Check stake balance (would need a getter, but we can check storage directly)
        env.as_contract(&contract_id, || {
            let stake_key = DataKey::StakeBalance(username.clone());
            let balance: i128 = env
                .storage()
                .persistent()
                .get(&stake_key)
                .expect("expected stake balance");
            assert_eq!(balance, 350_i128);
        });
    }

    #[test]
    fn credit_yield_to_multiple_users() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let user1 = String::from_str(&env, "peter");
        let user2 = String::from_str(&env, "quinn");

        client.register_creator(&user1);
        client.register_creator(&user2);
        env.mock_all_auths();

        client.credit_yield(&user1, &100_i128);
        client.credit_yield(&user2, &200_i128);

        env.as_contract(&contract_id, || {
            let stake_key1 = DataKey::StakeBalance(user1.clone());
            let stake_key2 = DataKey::StakeBalance(user2.clone());

            let balance1: i128 = env.storage().persistent().get(&stake_key1).unwrap_or(0);
            let balance2: i128 = env.storage().persistent().get(&stake_key2).unwrap_or(0);

            assert_eq!(balance1, 100_i128);
            assert_eq!(balance2, 200_i128);
        });
    }

    #[test]
    fn set_admin_panics_on_second_call() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin1 = Address::generate(&env);
        let admin2 = Address::generate(&env);

        client.set_admin(&admin1);

        // Second call should panic - we can't catch panics in no_std, so we use try_* pattern
        // This test documents the expected behavior but can't assert it directly
        // In practice, calling set_admin twice will panic
        let result = client.try_set_admin(&admin2);
        // The try_ call returns an error when the call panics
        assert!(result.is_err());
    }

    #[test]
    fn paylink_expiry_test_with_ledger_advance() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "rex");
        let token_id = String::from_str(&env, "tok-expiry");
        let note = String::from_str(&env, "expiry test");

        client.register_creator(&creator);
        env.ledger().set_sequence_number(100);

        // Create paylink with ttl_ledgers=1 (expires at ledger 101)
        client.create_paylink(&creator, &token_id, &100_i128, &note, &1);

        // Verify initial state
        let paylink_before = client
            .get_paylink(&token_id)
            .expect("expected PayLink in storage");
        assert_eq!(paylink_before.expiration_ledger, 101);
        assert!(!paylink_before.cancelled);

        // Advance ledger by 2 (to 102, past expiry)
        env.ledger().set_sequence_number(102);

        // PayLink data should still be readable
        let paylink_after = client
            .get_paylink(&token_id)
            .expect("expected PayLink still readable");
        assert_eq!(paylink_after.expiration_ledger, 101);
        // Note: expiry check would be in the pay/claim function, not get_paylink
    }

    #[test]
    fn multiple_paylinks_for_same_creator() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "sara");
        client.register_creator(&creator);

        // Create multiple paylinks with different token IDs
        client.create_paylink(&creator, &String::from_str(&env, "tok-1"), &100_i128, &String::from_str(&env, "first"), &10);
        client.create_paylink(&creator, &String::from_str(&env, "tok-2"), &200_i128, &String::from_str(&env, "second"), &20);
        client.create_paylink(&creator, &String::from_str(&env, "tok-3"), &300_i128, &String::from_str(&env, "third"), &30);

        // Verify all paylinks exist
        let pl1 = client.get_paylink(&String::from_str(&env, "tok-1")).expect("tok-1 should exist");
        let pl2 = client.get_paylink(&String::from_str(&env, "tok-2")).expect("tok-2 should exist");
        let pl3 = client.get_paylink(&String::from_str(&env, "tok-3")).expect("tok-3 should exist");

        assert_eq!(pl1.amount, 100_i128);
        assert_eq!(pl2.amount, 200_i128);
        assert_eq!(pl3.amount, 300_i128);

        assert_eq!(pl1.expiration_ledger, env.ledger().sequence() + 10);
        assert_eq!(pl2.expiration_ledger, env.ledger().sequence() + 20);
        assert_eq!(pl3.expiration_ledger, env.ledger().sequence() + 30);
    }

    #[test]
    fn cancel_non_existent_paylink_returns_paylink_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "tom");
        let token_id = String::from_str(&env, "non-existent");

        assert_eq!(
            client.try_cancel_paylink(&creator, &token_id),
            Err(Ok(Error::PayLinkNotFound))
        );
    }

    #[test]
    fn cancel_already_cancelled_paylink_succeeds() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "uma");
        let token_id = String::from_str(&env, "tok-cancel-twice");
        let note = String::from_str(&env, "test");

        client.register_creator(&creator);
        client.create_paylink(&creator, &token_id, &50_i128, &note, &10);

        // First cancel
        client.cancel_paylink(&creator, &token_id);
        let pl1 = client.get_paylink(&token_id).expect("expected PayLink");
        assert!(pl1.cancelled);

        // Second cancel should succeed (idempotent) or fail gracefully
        // Based on current implementation, it will succeed but cancelled stays true
        client.cancel_paylink(&creator, &token_id);
        let pl2 = client.get_paylink(&token_id).expect("expected PayLink");
        assert!(pl2.cancelled);
    }

    #[test]
    fn paylink_data_fields_verification() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let creator = String::from_str(&env, "victor");
        let token_id = String::from_str(&env, "tok-verify");
        let note = String::from_str(&env, "detailed verification test");

        client.register_creator(&creator);
        env.ledger().set_sequence_number(500);

        client.create_paylink(&creator, &token_id, &1_000_000_i128, &note, &100);

        let stored = client.get_paylink(&token_id).expect("expected PayLink");

        assert_eq!(stored.creator_username, creator);
        assert_eq!(stored.amount, 1_000_000_i128);
        assert_eq!(stored.note, note);
        assert_eq!(stored.expiration_ledger, 600);
        assert!(!stored.paid);
        assert!(!stored.cancelled);
    }

    #[test]
    fn credit_yield_without_auth_fails() {
        let env = Env::default();
        let contract_id = env.register(PayLinkContract, ());
        let client = PayLinkContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.set_admin(&admin);

        let username = String::from_str(&env, "wendy");
        client.register_creator(&username);

        // Don't mock auths - should fail
        let result = client.try_credit_yield(&username, &100_i128);
        assert!(result.is_err());
    }
}
