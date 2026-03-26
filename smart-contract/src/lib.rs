#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

const BALANCE_BUMP_THRESHOLD: u32 = 100;
const BALANCE_BUMP_AMOUNT: u32 = 1000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    UsernameToAddr(String),
    AddrToUsername(Address),
    Balance(String),
    StakeBalance(String),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    UserNotFound = 1,
}

#[contract]
pub struct UserLookupContract;

#[contractimpl]
impl UserLookupContract {
    pub fn get_address(env: Env, username: String) -> Result<Address, ContractError> {
        let key = DataKey::UsernameToAddr(username);
        bump_balance_ttl(&env, &key);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::UserNotFound)
    }

    pub fn get_username(env: Env, address: Address) -> Result<String, ContractError> {
        let key = DataKey::AddrToUsername(address);
        bump_balance_ttl(&env, &key);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::UserNotFound)
    }

    pub fn get_balance(env: Env, username: String) -> Result<i128, ContractError> {
        let key = DataKey::Balance(username);
        bump_balance_ttl(&env, &key);
        Ok(env.storage().persistent().get(&key).unwrap_or(0))
    }

    pub fn get_stake_balance(env: Env, username: String) -> Result<i128, ContractError> {
        let key = DataKey::StakeBalance(username);
        bump_balance_ttl(&env, &key);
        Ok(env.storage().persistent().get(&key).unwrap_or(0))
    }
}

fn bump_balance_ttl(env: &Env, key: &DataKey) {
    if env.storage().persistent().has(key) {
        env.storage()
            .persistent()
            .extend_ttl(key, BALANCE_BUMP_THRESHOLD, BALANCE_BUMP_AMOUNT);
    }
}

#[cfg(test)]
mod test {
    use super::{ContractError, DataKey, UserLookupContract};
    use soroban_sdk::{
        testutils::storage::Persistent as _, testutils::Address as _, Address, Env, String,
    };

    #[test]
    fn get_address_reads_existing_user_and_bumps_ttl() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());

        let username = String::from_str(&env, "alice");
        let address = Address::generate(&env);
        let key = DataKey::UsernameToAddr(username.clone());

        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key, &address);
        });

        let before_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let result = env.as_contract(&contract_id, || {
            UserLookupContract::get_address(env.clone(), username.clone())
        });
        let after_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));

        assert_eq!(result, Ok(address));
        assert!(after_ttl >= before_ttl);
    }

    #[test]
    fn get_address_for_non_existent_user_returns_not_found() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());
        let username = String::from_str(&env, "missing");

        let result = env.as_contract(&contract_id, || {
            UserLookupContract::get_address(env.clone(), username.clone())
        });
        assert_eq!(result, Err(ContractError::UserNotFound));
    }

    #[test]
    fn get_username_reads_existing_user_and_bumps_ttl() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());

        let username = String::from_str(&env, "bob");
        let address = Address::generate(&env);
        let key = DataKey::AddrToUsername(address.clone());

        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key, &username);
        });

        let before_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let result = env.as_contract(&contract_id, || {
            UserLookupContract::get_username(env.clone(), address.clone())
        });
        let after_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));

        assert_eq!(result, Ok(username));
        assert!(after_ttl >= before_ttl);
    }

    #[test]
    fn get_username_for_non_existent_user_returns_not_found() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());
        let address = Address::generate(&env);

        let result = env.as_contract(&contract_id, || {
            UserLookupContract::get_username(env.clone(), address.clone())
        });
        assert_eq!(result, Err(ContractError::UserNotFound));
    }

    #[test]
    fn get_balance_defaults_to_zero_and_bumps_ttl_when_present() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());

        let existing_username = String::from_str(&env, "carol");
        let key = DataKey::Balance(existing_username.clone());
        let existing_value: i128 = 500;

        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key, &existing_value);
        });

        let before_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let existing_result = env.as_contract(&contract_id, || {
            UserLookupContract::get_balance(env.clone(), existing_username.clone())
        });
        let after_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let missing_result = env.as_contract(&contract_id, || {
            UserLookupContract::get_balance(env.clone(), String::from_str(&env, "nobody"))
        });

        assert_eq!(existing_result, Ok(existing_value));
        assert_eq!(missing_result, Ok(0));
        assert!(after_ttl >= before_ttl);
    }

    #[test]
    fn get_stake_balance_defaults_to_zero_and_bumps_ttl_when_present() {
        let env = Env::default();
        let contract_id = env.register(UserLookupContract, ());

        let existing_username = String::from_str(&env, "dave");
        let key = DataKey::StakeBalance(existing_username.clone());
        let existing_value: i128 = 42;

        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&key, &existing_value);
        });

        let before_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let existing_result = env.as_contract(&contract_id, || {
            UserLookupContract::get_stake_balance(env.clone(), existing_username.clone())
        });
        let after_ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
        let missing_result = env.as_contract(&contract_id, || {
            UserLookupContract::get_stake_balance(env.clone(), String::from_str(&env, "nobody"))
        });

        assert_eq!(existing_result, Ok(existing_value));
        assert_eq!(missing_result, Ok(0));
        assert!(after_ttl >= before_ttl);
    }
}
