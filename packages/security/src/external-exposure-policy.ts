export type ExternalExposurePolicy = {
  architecture: {
    strategy: 'reverse-tunnel' | 'port-forwarding';
    provider: string;
    reason: string;
  };
  domain: {
    fqdn: string;
    dnsProvider: string;
  };
  tls: {
    mode: 'full-strict' | 'full' | 'off';
    certificateSource: 'managed' | 'acme' | 'none';
    https: boolean;
    wss: boolean;
  };
  auth: {
    nextAuthEnforced: boolean;
    jwtRotationDays: number;
    allowOrigins: string[];
    cookieSecure: boolean;
    csrfProtection: boolean;
  };
  accessControl: {
    firewallDefaultDeny: boolean;
    allowlist: string[];
    fail2banEnabled: boolean;
    adminPathIpRestricted: boolean;
  };
  logging: {
    requestLogs: boolean;
    authLogs: boolean;
    retentionDays: number;
    piiRedactionEnabled: boolean;
  };
  operations: {
    healthcheckIntervalSec: number;
    restartPolicy: 'always' | 'on-failure';
    rollbackProcedureDocumented: boolean;
    runbookPath: string;
  };
};

export type PolicyValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateExternalExposurePolicy(policy: ExternalExposurePolicy): PolicyValidationResult {
  const errors: string[] = [];

  if (policy.architecture.strategy === 'port-forwarding') {
    errors.push('architecture.strategy must not be port-forwarding for internet exposure');
  }

  if (!policy.tls.https || !policy.tls.wss) {
    errors.push('tls.https and tls.wss must both be enabled');
  }

  if (policy.tls.mode === 'off') {
    errors.push('tls.mode must not be off');
  }

  if (policy.auth.allowOrigins.some((origin) => origin.trim() === '*')) {
    errors.push('auth.allowOrigins must not contain wildcard (*)');
  }

  if (!policy.auth.cookieSecure) {
    errors.push('auth.cookieSecure must be true');
  }

  if (!policy.auth.nextAuthEnforced) {
    errors.push('auth.nextAuthEnforced must be true');
  }

  if (policy.auth.jwtRotationDays < 1 || policy.auth.jwtRotationDays > 7) {
    errors.push('auth.jwtRotationDays must be between 1 and 7');
  }

  if (!policy.auth.csrfProtection) {
    errors.push('auth.csrfProtection must be true');
  }

  if (!policy.accessControl.firewallDefaultDeny) {
    errors.push('accessControl.firewallDefaultDeny must be true');
  }

  if (policy.accessControl.allowlist.length === 0) {
    errors.push('accessControl.allowlist must contain at least one source');
  }

  if (!policy.accessControl.fail2banEnabled) {
    errors.push('accessControl.fail2banEnabled must be true');
  }

  if (!policy.accessControl.adminPathIpRestricted) {
    errors.push('accessControl.adminPathIpRestricted must be true');
  }

  if (!policy.logging.requestLogs || !policy.logging.authLogs) {
    errors.push('logging.requestLogs and logging.authLogs must be true');
  }

  if (policy.logging.retentionDays < 14) {
    errors.push('logging.retentionDays must be at least 14');
  }

  if (!policy.logging.piiRedactionEnabled) {
    errors.push('logging.piiRedactionEnabled must be true');
  }

  if (policy.operations.healthcheckIntervalSec > 60) {
    errors.push('operations.healthcheckIntervalSec must be 60 seconds or less');
  }

  if (!policy.operations.rollbackProcedureDocumented) {
    errors.push('operations.rollbackProcedureDocumented must be true');
  }

  if (!policy.operations.runbookPath.startsWith('docs/')) {
    errors.push('operations.runbookPath must point to docs/');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
