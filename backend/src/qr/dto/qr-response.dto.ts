export class QrResponseDto {
  /** Base64 PNG data URL: data:image/png;base64,... */
  qrDataUrl!: string;

  /** The deep link URL encoded in the QR code */
  paymentUrl!: string;
}
