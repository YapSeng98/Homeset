import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Store, OrgRecord, UserRecord } from './store/types';
import { DEV_ORG_ID, DEV_USER_ID } from './store/sqlite';

export interface AuthContext {
  user: UserRecord;
  org: OrgRecord;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/**
 * Resolves who is calling. PROTOTYPE: everyone is the seeded demo agent.
 * Next step: real sign-up/login (email OTP or Google), sessions, and role checks.
 * Routes only read `request.auth`, so swapping this out does not touch them.
 */
export function createAuthenticate(store: Store) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    const user = await store.getUser(DEV_USER_ID);
    const org = user && (await store.getOrg(user.orgId ?? DEV_ORG_ID));
    if (!user || !org) return reply.code(401).send({ error: 'Not signed in' });
    request.auth = { user, org };
  };
}
