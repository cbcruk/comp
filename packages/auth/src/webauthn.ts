import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { base64UrlToBytes, bytesToBase64Url, encodeUtf8 } from "./base64url.js";
import type { PasskeyStore } from "./passkey-store.types.js";

export type RegistrationResponse = Parameters<
  typeof verifyRegistrationResponse
>[0]["response"];
export type AuthenticationResponse = Parameters<
  typeof verifyAuthenticationResponse
>[0]["response"];

export interface RpInfo {
  /** Relying party id — the registrable domain, e.g. "example.com". */
  rpID: string;
  rpName: string;
  /** Full origin the ceremony runs on, e.g. "https://admin.example.com". */
  origin: string;
}

export interface PasskeyUser {
  id: string;
  name: string;
}

type CredentialTransport = NonNullable<RegistrationResponse["response"]["transports"]>[number];

/** Registration ceremony — step 1: options for `navigator.credentials.create`. */
export async function startRegistration(
  store: PasskeyStore,
  rp: RpInfo,
  user: PasskeyUser,
) {
  const existing = await store.getCredentialsByUser(user.id);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.name,
    userID: encodeUtf8(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((credential) => ({
      id: credential.id,
      transports: credential.transports as CredentialTransport[] | undefined,
    })),
  });
  await store.saveChallenge(user.id, options.challenge);
  return options;
}

/** Registration ceremony — step 2: verify and persist the new credential. */
export async function finishRegistration(
  store: PasskeyStore,
  rp: RpInfo,
  user: PasskeyUser,
  response: RegistrationResponse,
): Promise<{ credentialId: string }> {
  const expectedChallenge = await store.takeChallenge(user.id);
  if (!expectedChallenge) throw new Error("No registration challenge in flight");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration could not be verified");
  }

  const { credential } = verification.registrationInfo;
  await store.saveCredential({
    id: credential.id,
    publicKey: bytesToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports,
    userId: user.id,
  });
  return { credentialId: credential.id };
}

/** Authentication ceremony — step 1: options for `navigator.credentials.get`. */
export async function startAuthentication(
  store: PasskeyStore,
  rp: RpInfo,
  user: PasskeyUser,
) {
  const credentials = await store.getCredentialsByUser(user.id);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports as CredentialTransport[] | undefined,
    })),
  });
  await store.saveChallenge(user.id, options.challenge);
  return options;
}

/** Authentication ceremony — step 2: verify the assertion, bump the counter. */
export async function finishAuthentication(
  store: PasskeyStore,
  rp: RpInfo,
  user: PasskeyUser,
  response: AuthenticationResponse,
): Promise<{ userId: string }> {
  const expectedChallenge = await store.takeChallenge(user.id);
  if (!expectedChallenge) throw new Error("No authentication challenge in flight");

  const credential = await store.getCredentialById(response.id);
  if (!credential || credential.userId !== user.id) {
    throw new Error("Unknown credential for user");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: {
      id: credential.id,
      publicKey: base64UrlToBytes(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as CredentialTransport[] | undefined,
    },
  });
  if (!verification.verified) throw new Error("Authentication could not be verified");

  await store.updateCounter(credential.id, verification.authenticationInfo.newCounter);
  return { userId: user.id };
}
