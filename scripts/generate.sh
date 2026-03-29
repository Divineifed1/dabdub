
echo "Generating secrets..."

echo "JWT_ACCESS_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
echo "STELLAR_WALLET_ENCRYPTION_KEY=$(openssl rand -base64 32 | cut -c1-32)"

echo "Done."