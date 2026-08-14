export type EncryptedPayload = {
  version: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};
