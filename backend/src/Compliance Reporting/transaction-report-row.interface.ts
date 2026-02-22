/** Exact field order required by AML/CFT regulators */
export interface TransactionReportRow {
  reportDate: string;
  transactionId: string;
  merchantId: string;
  merchantName: string;
  merchantCountry: string;
  chain: string;
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  tokenSymbol: string;
  tokenAmount: string;
  usdAmount: string;
  exchangeRate: string;
  platformFeeUsd: string;
  networkFeeUsd: string;
  merchantPayoutUsd: string;
  status: string;
  confirmedAt: string;
  settledAt: string;
  settlementId: string;
  bankTransferRef: string;
  riskFlags: string;
}

export const TRANSACTION_REPORT_HEADERS: (keyof TransactionReportRow)[] = [
  'reportDate',
  'transactionId',
  'merchantId',
  'merchantName',
  'merchantCountry',
  'chain',
  'txHash',
  'blockNumber',
  'fromAddress',
  'toAddress',
  'tokenSymbol',
  'tokenAmount',
  'usdAmount',
  'exchangeRate',
  'platformFeeUsd',
  'networkFeeUsd',
  'merchantPayoutUsd',
  'status',
  'confirmedAt',
  'settledAt',
  'settlementId',
  'bankTransferRef',
  'riskFlags',
];
