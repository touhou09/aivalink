import { describe, expect, it } from 'vitest';

import {
  type ExternalExposurePolicy,
  validateExternalExposurePolicy
} from '../external-exposure-policy';

const basePolicy: ExternalExposurePolicy = {
  architecture: {
    strategy: 'reverse-tunnel',
    provider: 'cloudflare-tunnel',
    reason: 'Avoid direct inbound exposure from internet'
  },
  domain: {
    fqdn: 'chat.example.com',
    dnsProvider: 'cloudflare'
  },
  tls: {
    mode: 'full-strict',
    certificateSource: 'managed',
    https: true,
    wss: true
  },
  auth: {
    nextAuthEnforced: true,
    jwtRotationDays: 7,
    allowOrigins: ['https://chat.example.com'],
    cookieSecure: true,
    csrfProtection: true
  },
  accessControl: {
    firewallDefaultDeny: true,
    allowlist: ['Cloudflare edge IP ranges'],
    fail2banEnabled: true,
    adminPathIpRestricted: true
  },
  logging: {
    requestLogs: true,
    authLogs: true,
    retentionDays: 30,
    piiRedactionEnabled: true
  },
  operations: {
    healthcheckIntervalSec: 30,
    restartPolicy: 'always',
    rollbackProcedureDocumented: true,
    runbookPath: 'docs/deploy/mac-host-external-access-runbook.md'
  }
};

describe('validateExternalExposurePolicy', () => {
  it('accepts a policy that satisfies issue #68 security/ops criteria', () => {
    const result = validateExternalExposurePolicy(basePolicy);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects direct port-forwarding architecture', () => {
    const result = validateExternalExposurePolicy({
      ...basePolicy,
      architecture: {
        strategy: 'port-forwarding',
        provider: 'router-nat',
        reason: 'quick setup'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('architecture.strategy must not be port-forwarding for internet exposure');
  });

  it('rejects insecure auth/cors/tls combinations', () => {
    const result = validateExternalExposurePolicy({
      ...basePolicy,
      tls: {
        mode: 'off',
        certificateSource: 'none',
        https: false,
        wss: false
      },
      auth: {
        ...basePolicy.auth,
        allowOrigins: ['*'],
        cookieSecure: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'tls.https and tls.wss must both be enabled',
        'auth.allowOrigins must not contain wildcard (*)',
        'auth.cookieSecure must be true'
      ])
    );
  });

  it('requires firewall default deny, logging retention and rollback docs', () => {
    const result = validateExternalExposurePolicy({
      ...basePolicy,
      accessControl: {
        ...basePolicy.accessControl,
        firewallDefaultDeny: false
      },
      logging: {
        ...basePolicy.logging,
        retentionDays: 3
      },
      operations: {
        ...basePolicy.operations,
        rollbackProcedureDocumented: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'accessControl.firewallDefaultDeny must be true',
        'logging.retentionDays must be at least 14',
        'operations.rollbackProcedureDocumented must be true'
      ])
    );
  });

  it('rejects weak session hardening settings', () => {
    const result = validateExternalExposurePolicy({
      ...basePolicy,
      auth: {
        ...basePolicy.auth,
        jwtRotationDays: 30,
        csrfProtection: false
      },
      accessControl: {
        ...basePolicy.accessControl,
        adminPathIpRestricted: false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'auth.jwtRotationDays must be between 1 and 7',
        'auth.csrfProtection must be true',
        'accessControl.adminPathIpRestricted must be true'
      ])
    );
  });
});
