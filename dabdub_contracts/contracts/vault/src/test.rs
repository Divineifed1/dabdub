#![cfg(test)]
use crate::{access_control, Vault, VaultClient};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

#[test]
fn test_grant_role() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let operator = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    // Grant operator role
    client.grant_role(&admin, &operator, &access_control::OPERATOR_ROLE);

    assert!(client.has_role(&operator, &access_control::OPERATOR_ROLE));
}

#[test]
fn test_revoke_role() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let operator = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);
    client.grant_role(&admin, &operator, &access_control::OPERATOR_ROLE);

    // Revoke role
    client.revoke_role(&admin, &operator, &access_control::OPERATOR_ROLE);

    assert!(!client.has_role(&operator, &access_control::OPERATOR_ROLE));
}

#[test]
#[should_panic(expected = "Missing required role")]
fn test_only_admin_can_grant() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let operator = Address::generate(&env);
    let non_admin = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    // Non-admin tries to grant role - should panic
    client.grant_role(&non_admin, &operator, &access_control::OPERATOR_ROLE);
}

#[test]
fn test_multiple_roles() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let operator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    // Grant multiple roles
    client.grant_role(&admin, &user, &access_control::OPERATOR_ROLE);
    client.grant_role(&admin, &user, &access_control::TREASURER_ROLE);

    assert!(client.has_role(&user, &access_control::OPERATOR_ROLE));
    assert!(client.has_role(&user, &access_control::TREASURER_ROLE));
}

#[test]
fn test_has_role_returns_false() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let operator = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    assert!(!client.has_role(&user, &access_control::OPERATOR_ROLE));
}

#[test]
fn test_constructor() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_fee_amount(), 500_000);
    assert_eq!(client.get_min_deposit(), 1_000_000);
    assert_eq!(client.is_paused(), false);
}

#[test]
#[should_panic(expected = "Fee exceeds maximum")]
fn test_constructor_fee_too_high() {
    let env = Env::default();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    env.register(
        Vault,
        (&admin, &usdc, &10_000_000i128, &1_000_000i128), // Fee > MAX_FEE
    );
}

#[test]
#[ignore] //TODO Skip until transfer_to_vault implementation
fn test_process_payment() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let user_wallet = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let asset_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let usdc = asset_contract.address();

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    // Grant operator role
    client.grant_role(&admin, &operator, &access_control::OPERATOR_ROLE);

    // Mint tokens to user wallet
    let token_admin_client = token::StellarAssetClient::new(&env, &usdc);
    token_admin_client.mint(&user_wallet, &100_000_000);

    // Process payment
    let payment_id = BytesN::from_array(&env, &[1u8; 32]);
    client.process_payment(&operator, &user_wallet, &50_000_000, &payment_id);

    // Verify tracking
    let (payments, fees, total) = client.get_available_withdrawal();
    assert_eq!(payments, 50_000_000);
    assert_eq!(fees, 500_000);
    assert_eq!(total, 50_500_000);

    // Verify tokens transferred to vault
    let token_client = token::Client::new(&env, &usdc);
    assert_eq!(token_client.balance(&contract_id), 50_500_000);
    assert_eq!(token_client.balance(&user_wallet), 49_500_000);
}

#[test]
#[should_panic(expected = "Missing required role")]
fn test_process_payment_not_operator() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let not_operator = Address::generate(&env);
    let user_wallet = Address::generate(&env);
    let usdc = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    let payment_id = BytesN::from_array(&env, &[1u8; 32]);
    client.process_payment(&not_operator, &user_wallet, &50_000_000, &payment_id);
}

#[test]
#[should_panic(expected = "Contract is paused")]
fn test_process_payment_when_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let user_wallet = Address::generate(&env);
    let usdc = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    client.grant_role(&admin, &operator, &access_control::OPERATOR_ROLE);
    client.pause(&admin);

    let payment_id = BytesN::from_array(&env, &[1u8; 32]);
    client.process_payment(&operator, &user_wallet, &50_000_000, &payment_id);
}

#[test]
fn test_pause_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    client.pause(&admin);
    assert_eq!(client.is_paused(), true);

    client.unpause(&admin);
    assert_eq!(client.is_paused(), false);
}

#[test]
#[ignore] //TODO Skip until transfer_to_vault implementation
fn test_verify_vault_accounting() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let user_wallet = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let asset_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let usdc = asset_contract.address();

    let contract_id = env.register(Vault, (&admin, &usdc, &500_000i128, &1_000_000i128));
    let client = VaultClient::new(&env, &contract_id);

    client.grant_role(&admin, &operator, &access_control::OPERATOR_ROLE);

    // Mint and process payment
    let token_admin_client = token::StellarAssetClient::new(&env, &usdc);
    token_admin_client.mint(&user_wallet, &100_000_000);

    let payment_id = BytesN::from_array(&env, &[1u8; 32]);
    client.process_payment(&operator, &user_wallet, &50_000_000, &payment_id);

    // Verify accounting
    assert_eq!(client.verify_vault_accounting(), true);
}
