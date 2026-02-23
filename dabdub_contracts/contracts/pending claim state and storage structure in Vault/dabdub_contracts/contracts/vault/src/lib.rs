use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Vec};

#[contracttype]
pub struct PendingClaim {
    pub user_wallet: Address,
    pub payment_amount: i128,
    pub fee_amount: i128,
    pub recipient: Address,
    pub expiry_ledger: u32,
    pub payment_id: BytesN<32>,
}

#[contracttype]
pub enum DataKey {
    PendingClaim(BytesN<32>),
    AllPendingClaims,
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    /// Process a payment by creating a pending claim
    pub fn process_payment(
        env: Env,
        user_wallet: Address,
        payment_amount: i128,
        fee_amount: i128,
        recipient: Address,
        claim_period_ledgers: u32,
        payment_id: BytesN<32>,
    ) -> Result<(), &'static str> {
        user_wallet.require_auth();

        let current_ledger = env.ledger().sequence();
        let expiry_ledger = current_ledger + claim_period_ledgers;

        let pending_claim = PendingClaim {
            user_wallet: user_wallet.clone(),
            payment_amount,
            fee_amount,
            recipient: recipient.clone(),
            expiry_ledger,
            payment_id: payment_id.clone(),
        };

        // Store the pending claim
        env.storage()
            .persistent()
            .set(&DataKey::PendingClaim(payment_id.clone()), &pending_claim);

        // Add to all pending claims index
        let mut all_claims: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::AllPendingClaims)
            .unwrap_or(Vec::new(&env));
        
        all_claims.push_back(payment_id);
        env.storage()
            .persistent()
            .set(&DataKey::AllPendingClaims, &all_claims);

        Ok(())
    }

    /// Get a pending claim by payment ID
    pub fn get_pending_claim(env: Env, payment_id: BytesN<32>) -> Option<PendingClaim> {
        env.storage()
            .persistent()
            .get(&DataKey::PendingClaim(payment_id))
    }

    /// Get all pending claim IDs
    pub fn get_all_pending_claims(env: Env) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::AllPendingClaims)
            .unwrap_or(Vec::new(&env))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_create_pending_claim() {
        let env = Env::default();
        let contract_id = env.register_contract(None, VaultContract);
        let client = VaultContractClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let recipient = Address::generate(&env);
        let payment_id = BytesN::from_array(&env, &[1u8; 32]);
        let payment_amount = 1000i128;
        let fee_amount = 50i128;
        let claim_period = 100u32;

        env.mock_all_auths();

        let result = client.process_payment(
            &user,
            &payment_amount,
            &fee_amount,
            &recipient,
            &claim_period,
            &payment_id,
        );

        assert!(result.is_ok());

        // Verify pending claim was created
        let claim = client.get_pending_claim(&payment_id);
        assert!(claim.is_some());

        let claim = claim.unwrap();
        assert_eq!(claim.user_wallet, user);
        assert_eq!(claim.payment_amount, payment_amount);
        assert_eq!(claim.fee_amount, fee_amount);
        assert_eq!(claim.recipient, recipient);
        assert_eq!(claim.payment_id, payment_id);
    }

    #[test]
    fn test_multiple_pending_claims() {
        let env = Env::default();
        let contract_id = env.register_contract(None, VaultContract);
        let client = VaultContractClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let recipient = Address::generate(&env);
        
        env.mock_all_auths();

        // Create multiple pending claims
        for i in 0..3 {
            let mut payment_id_array = [0u8; 32];
            payment_id_array[0] = i;
            let payment_id = BytesN::from_array(&env, &payment_id_array);

            client.process_payment(
                &user,
                &1000i128,
                &50i128,
                &recipient,
                &100u32,
                &payment_id,
            ).unwrap();
        }

        // Verify all claims are indexed
        let all_claims = client.get_all_pending_claims();
        assert_eq!(all_claims.len(), 3);
    }

    #[test]
    fn test_pending_claim_expiry() {
        let env = Env::default();
        let contract_id = env.register_contract(None, VaultContract);
        let client = VaultContractClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let recipient = Address::generate(&env);
        let payment_id = BytesN::from_array(&env, &[1u8; 32]);
        let claim_period = 100u32;

        env.mock_all_auths();

        let current_ledger = env.ledger().sequence();

        client.process_payment(
            &user,
            &1000i128,
            &50i128,
            &recipient,
            &claim_period,
            &payment_id,
        ).unwrap();

        let claim = client.get_pending_claim(&payment_id).unwrap();
        assert_eq!(claim.expiry_ledger, current_ledger + claim_period);
    }
}
