/**
 * Channel/provider registry — explicit map, no magic discovery.
 *
 * v1 wires two static routes: 'whatsapp' → 'ycloud' (the env-based send path)
 * and 'telegram' → 'telegram' (bot token held in agent_config). Social
 * channels (instagram/facebook via Zernio) resolve strictly through
 * `channel_accounts` rows — they have no static route and no legacy fallback.
 */

import { channelValues, providerIdValues } from "./types";
import type { Channel, ProviderId } from "./types";

/** All contract provider ids — registered or not. */
export const PROVIDER_IDS: readonly ProviderId[] = providerIdValues;

/** All contract channels — kept in sync with the `channel` pgEnum. */
export const CHANNEL_KINDS: readonly Channel[] = channelValues;

export function isProviderId(value: string): value is ProviderId {
  return (providerIdValues as readonly string[]).includes(value);
}

export function isChannelKind(value: string): value is Channel {
  return (channelValues as readonly string[]).includes(value);
}

/** Hard-coded channel → provider routing (single install, v1). */
const CHANNEL_PROVIDER = new Map<Channel, ProviderId>([
  ["whatsapp", "ycloud"],
  ["telegram", "telegram"],
]);

export function providerForChannel(channel: Channel): ProviderId | undefined {
  return CHANNEL_PROVIDER.get(channel);
}
