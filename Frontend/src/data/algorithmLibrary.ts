/**
 * Local static algorithm library — source of truth for the Organizational
 * Cryptography Profile.  Data mirrors the scoring engine's PQ_RESISTANCE_TABLE
 * (universal-scoring-service/core/algorithms.py) expressed as human-readable
 * labels.  Organisations can override these via the Profile UI; overrides are
 * persisted to the backend and feed into PQC score re-calculation.
 */

export interface AlgorithmEntry {
  id: string;
  algorithm_name: string;
  variant: string;
  purpose: string;
  usage_context: string[];
  status_today: string;   // Strong | Medium | Weak | Insecure
  pqc_status: string;     // Safe | Medium | Weak | Standardized
  priority: string;       // High | Medium | Low
  classical_recommended: string;
  quantum_recommended: string;
  nist_reference: string[];
  notes: string;
  section: string;
  visible: boolean;
}

export const DEFAULT_ALGORITHM_LIBRARY: AlgorithmEntry[] = [
  // ─────────────────────────── Symmetric Algorithms ────────────────────────
  {
    id: 'aes-128-cbc',
    algorithm_name: 'AES-128-CBC',
    variant: '128-bit',
    purpose: 'Encryption',
    usage_context: ['TLS', 'SSH', 'VPN', 'File Encryption'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38A'],
    notes: 'CBC mode is secure when IV and padding are properly managed.',
    section: 'Symmetric Algorithms',
    visible: true,
  },
  {
    id: 'aes-128-gcm',
    algorithm_name: 'AES-128-GCM',
    variant: '128-bit',
    purpose: 'Authenticated Encryption',
    usage_context: ['TLS', 'SSH', 'VPN', 'File Encryption'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38D'],
    notes: 'GCM provides both confidentiality and integrity; preferred over CBC.',
    section: 'Symmetric Algorithms',
    visible: true,
  },
  {
    id: 'aes-128-ctr',
    algorithm_name: 'AES-128-CTR',
    variant: '128-bit',
    purpose: 'Encryption',
    usage_context: ['TLS', 'VPN', 'File Encryption'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38A'],
    notes: 'Stream cipher mode; requires unique counter per message.',
    section: 'Symmetric Algorithms',
    visible: true,
  },
  {
    id: 'aes-256-gcm',
    algorithm_name: 'AES-256-GCM',
    variant: '256-bit',
    purpose: 'Authenticated Encryption',
    usage_context: ['TLS', 'SSH', 'VPN', 'File Encryption'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38D'],
    notes: 'Preferred for new systems; 256-bit key resists Grover\'s algorithm.',
    section: 'Symmetric Algorithms',
    visible: false,
  },
  {
    id: 'chacha20-poly1305',
    algorithm_name: 'ChaCha20-Poly1305',
    variant: '256-bit',
    purpose: 'Authenticated Encryption',
    usage_context: ['TLS 1.3', 'VPN', 'Mobile'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['RFC 8439'],
    notes: 'Fast software implementation; widely used in TLS 1.3.',
    section: 'Symmetric Algorithms',
    visible: false,
  },
  {
    id: '3des',
    algorithm_name: '3DES',
    variant: '112/168-bit effective',
    purpose: 'Encryption',
    usage_context: ['Legacy TLS', 'Legacy SSH'],
    status_today: 'Weak',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'no',
    quantum_recommended: 'no',
    nist_reference: [],
    notes: 'NIST deprecated in 2023; vulnerable to Sweet32 birthday attack.',
    section: 'Symmetric Algorithms',
    visible: false,
  },
  {
    id: 'rc4',
    algorithm_name: 'RC4',
    variant: 'Variable',
    purpose: 'Stream Encryption',
    usage_context: ['Legacy TLS'],
    status_today: 'Insecure',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'no',
    quantum_recommended: 'no',
    nist_reference: [],
    notes: 'Prohibited in TLS (RFC 7465); multiple statistical biases.',
    section: 'Symmetric Algorithms',
    visible: false,
  },

  // ─────────────────────────── Asymmetric Algorithms ───────────────────────
  {
    id: 'rsa-1024',
    algorithm_name: 'RSA-1024',
    variant: '1024-bit',
    purpose: 'Encryption / Digital Signatures',
    usage_context: ['TLS', 'SSH', 'PGP', 'S/MIME'],
    status_today: 'Weak',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'no',
    quantum_recommended: 'no',
    nist_reference: [],
    notes: 'Vulnerable to classical factoring attacks; not recommended.',
    section: 'Asymmetric Algorithms',
    visible: true,
  },
  {
    id: 'rsa-2048',
    algorithm_name: 'RSA-2048',
    variant: '2048-bit',
    purpose: 'Encryption / Digital Signatures',
    usage_context: ['TLS', 'SSH', 'PGP', 'S/MIME'],
    status_today: 'Medium',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['NIST SP 800-131A'],
    notes: "Currently secure classically; vulnerable to Shor's algorithm.",
    section: 'Asymmetric Algorithms',
    visible: true,
  },
  {
    id: 'rsa-3072',
    algorithm_name: 'RSA-3072',
    variant: '3072-bit',
    purpose: 'Encryption / Digital Signatures',
    usage_context: ['TLS', 'SSH', 'PGP', 'S/MIME'],
    status_today: 'Strong',
    pqc_status: 'Weak',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['NIST SP 800-131A'],
    notes: "Strong classically; Shor's algorithm threatens quantum security.",
    section: 'Asymmetric Algorithms',
    visible: true,
  },
  {
    id: 'ecdsa-p256',
    algorithm_name: 'ECDSA-P256',
    variant: 'P-256',
    purpose: 'Digital Signatures',
    usage_context: ['TLS', 'SSH', 'Code Signing'],
    status_today: 'Strong',
    pqc_status: 'Weak',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['FIPS 186-4'],
    notes: "Shorter keys than RSA; still quantum-vulnerable via Shor's.",
    section: 'Asymmetric Algorithms',
    visible: false,
  },
  {
    id: 'ed25519',
    algorithm_name: 'Ed25519',
    variant: 'Curve25519',
    purpose: 'Digital Signatures',
    usage_context: ['SSH', 'TLS', 'Code Signing'],
    status_today: 'Strong',
    pqc_status: 'Weak',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['RFC 8032'],
    notes: 'Best classical signature practice today; quantum-vulnerable.',
    section: 'Asymmetric Algorithms',
    visible: false,
  },

  // ─────────────────────────── Hash Functions ───────────────────────────────
  {
    id: 'md5',
    algorithm_name: 'MD5',
    variant: '128-bit',
    purpose: 'Data Integrity / Checksums',
    usage_context: ['Legacy TLS', 'File Checksums'],
    status_today: 'Insecure',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'no',
    quantum_recommended: 'no',
    nist_reference: [],
    notes: 'Collision attacks exist; should not be used.',
    section: 'Hash Functions',
    visible: true,
  },
  {
    id: 'sha-1',
    algorithm_name: 'SHA-1',
    variant: '160-bit',
    purpose: 'Data Integrity / Digital Signatures',
    usage_context: ['TLS Certificates', 'Legacy SSH', 'PGP'],
    status_today: 'Weak',
    pqc_status: 'Weak',
    priority: 'High',
    classical_recommended: 'no',
    quantum_recommended: 'no',
    nist_reference: [],
    notes: 'Collision attacks possible; being phased out.',
    section: 'Hash Functions',
    visible: true,
  },
  {
    id: 'sha-224',
    algorithm_name: 'SHA-224',
    variant: '224-bit',
    purpose: 'Data Integrity / Signatures',
    usage_context: ['TLS', 'File Integrity'],
    status_today: 'Strong',
    pqc_status: 'Medium',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['FIPS 180-4'],
    notes: 'Quantum attacks reduce effective strength by half (Grover).',
    section: 'Hash Functions',
    visible: true,
  },
  {
    id: 'sha-256',
    algorithm_name: 'SHA-256',
    variant: '256-bit',
    purpose: 'Data Integrity / Digital Signatures',
    usage_context: ['TLS', 'Code Signing', 'Certificates'],
    status_today: 'Strong',
    pqc_status: 'Medium',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['FIPS 180-4'],
    notes: "128-bit quantum security via Grover's; still widely recommended.",
    section: 'Hash Functions',
    visible: false,
  },
  {
    id: 'sha-384',
    algorithm_name: 'SHA-384',
    variant: '384-bit',
    purpose: 'Data Integrity / Digital Signatures',
    usage_context: ['TLS', 'Code Signing', 'HMAC'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['FIPS 180-4'],
    notes: '192-bit quantum security; good long-term choice.',
    section: 'Hash Functions',
    visible: false,
  },
  {
    id: 'sha3-256',
    algorithm_name: 'SHA3-256',
    variant: '256-bit',
    purpose: 'Data Integrity',
    usage_context: ['TLS', 'File Integrity', 'Blockchain'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['FIPS 202'],
    notes: 'Keccak-based; different design from SHA-2; quantum-resistant.',
    section: 'Hash Functions',
    visible: false,
  },

  // ─────────────────────────── MACs & KDFs ─────────────────────────────────
  {
    id: 'cmac-aes-128',
    algorithm_name: 'CMAC-AES-128',
    variant: '128-bit',
    purpose: 'Message Authentication',
    usage_context: ['TLS', 'VPN', 'File Integrity'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38B'],
    notes: 'AES-based MAC; strong against classical and quantum attacks.',
    section: 'MACs & KDFs',
    visible: true,
  },
  {
    id: 'cmac-aes-256',
    algorithm_name: 'CMAC-AES-256',
    variant: '256-bit',
    purpose: 'Message Authentication',
    usage_context: ['TLS', 'VPN', 'File Integrity'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST SP 800-38B'],
    notes: 'AES-based MAC; strong against classical and quantum attacks.',
    section: 'MACs & KDFs',
    visible: true,
  },
  {
    id: 'pbkdf2-hmac-sha256',
    algorithm_name: 'PBKDF2-HMAC-SHA256',
    variant: 'Variable output',
    purpose: 'Password-Based Key Derivation',
    usage_context: ['File Encryption', 'TLS PSK', 'Password Storage'],
    status_today: 'Strong',
    pqc_status: 'Medium',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['NIST SP 800-132'],
    notes: 'Adjust iteration count for security; quantum attacks reduce strength.',
    section: 'MACs & KDFs',
    visible: true,
  },
  {
    id: 'hmac-sha256',
    algorithm_name: 'HMAC-SHA256',
    variant: '256-bit',
    purpose: 'Message Authentication',
    usage_context: ['TLS', 'API Auth', 'JWT'],
    status_today: 'Strong',
    pqc_status: 'Medium',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'no',
    nist_reference: ['FIPS 198-1'],
    notes: 'Standard HMAC construction; widely deployed.',
    section: 'MACs & KDFs',
    visible: false,
  },
  {
    id: 'argon2',
    algorithm_name: 'Argon2',
    variant: 'Argon2id',
    purpose: 'Password Hashing / Key Derivation',
    usage_context: ['Password Storage', 'Key Derivation'],
    status_today: 'Strong',
    pqc_status: 'Safe',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: [],
    notes: 'Winner of Password Hashing Competition; memory-hard.',
    section: 'MACs & KDFs',
    visible: false,
  },

  // ─────────────────────────── Post-Quantum Cryptography ───────────────────
  {
    id: 'kyber-512',
    algorithm_name: 'Kyber-512',
    variant: 'Level 1',
    purpose: 'Key Encapsulation / Encryption',
    usage_context: ['TLS 1.3', 'VPN', 'Secure Email'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 203'],
    notes: 'Level 1 security; NIST recommended for standardization.',
    section: 'Post-Quantum Cryptography',
    visible: true,
  },
  {
    id: 'kyber-768',
    algorithm_name: 'Kyber-768',
    variant: 'Level 3',
    purpose: 'Key Encapsulation / Encryption',
    usage_context: ['TLS 1.3', 'VPN', 'Secure Email'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 203'],
    notes: 'Level 3 security; NIST recommended for standardization.',
    section: 'Post-Quantum Cryptography',
    visible: true,
  },
  {
    id: 'kyber-1024',
    algorithm_name: 'Kyber-1024',
    variant: 'Level 5',
    purpose: 'Key Encapsulation / Encryption',
    usage_context: ['TLS 1.3', 'VPN', 'Secure Email'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 203'],
    notes: 'Level 5 security; NIST recommended for standardization.',
    section: 'Post-Quantum Cryptography',
    visible: true,
  },
  {
    id: 'dilithium3',
    algorithm_name: 'Dilithium3',
    variant: 'Level 3',
    purpose: 'Digital Signatures',
    usage_context: ['Code Signing', 'TLS', 'Certificates'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 204'],
    notes: 'CRYSTALS-Dilithium; NIST PQC standard for signatures.',
    section: 'Post-Quantum Cryptography',
    visible: false,
  },
  {
    id: 'falcon-512',
    algorithm_name: 'Falcon-512',
    variant: 'Level 1',
    purpose: 'Digital Signatures',
    usage_context: ['TLS', 'Code Signing'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'High',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 206'],
    notes: 'Compact signatures; NIST standardized.',
    section: 'Post-Quantum Cryptography',
    visible: false,
  },
  {
    id: 'sphincs-128f',
    algorithm_name: 'SPHINCS+-128f',
    variant: '128-bit',
    purpose: 'Digital Signatures',
    usage_context: ['Code Signing', 'Certificate Authority'],
    status_today: 'Strong',
    pqc_status: 'Standardized',
    priority: 'Medium',
    classical_recommended: 'yes',
    quantum_recommended: 'yes',
    nist_reference: ['NIST FIPS 205'],
    notes: 'Hash-based; stateless; conservative security assumptions.',
    section: 'Post-Quantum Cryptography',
    visible: false,
  },
];

/** Return only the visible rows for a given section (displayed by default). */
export function getDefaultSection(section: string): AlgorithmEntry[] {
  return DEFAULT_ALGORITHM_LIBRARY.filter(a => a.section === section);
}

export const ALGORITHM_SECTIONS = [
  'Symmetric Algorithms',
  'Asymmetric Algorithms',
  'Hash Functions',
  'MACs & KDFs',
  'Post-Quantum Cryptography',
] as const;

/**
 * Maps a pqc_status label → a 0-100 PQC score override multiplier.
 * Used by the backend when an org has saved a custom algorithm profile.
 */
export const PQC_STATUS_SCORE_MAP: Record<string, number> = {
  Standardized: 95,
  Safe: 75,
  Medium: 40,
  Weak: 10,
  Insecure: 0,
};

/**
 * Compute an adjustment factor (0.5–2.0) by comparing the org's saved
 * algorithm pqc_status values against the built-in defaults.
 *
 * If the org marks algorithms as safer → factor > 1 → scores go up.
 * If the org marks algorithms as weaker → factor < 1 → scores go down.
 *
 * The factor is applied to the displayed PQC readiness scores in the
 * Dashboard so changes to the org profile are immediately visible.
 */
export function computeProfileAdjustmentFactor(savedProfile: Record<string, any[]>): number {
  const sectionKeys = ['symmetric', 'asymmetric', 'hash', 'mac_kdf', 'pqc'];

  // Sum pqc scores from the saved profile (visible algorithms only)
  let orgTotal = 0, orgCount = 0;
  for (const key of sectionKeys) {
    const algos: any[] = savedProfile[key] ?? [];
    for (const algo of algos) {
      if (algo.visible === false) continue;
      orgTotal += PQC_STATUS_SCORE_MAP[algo.pqc_status] ?? 10;
      orgCount++;
    }
  }

  // Sum pqc scores from the built-in defaults (all visible algorithms)
  let defaultTotal = 0, defaultCount = 0;
  for (const algo of DEFAULT_ALGORITHM_LIBRARY) {
    if (!algo.visible) continue;
    defaultTotal += PQC_STATUS_SCORE_MAP[algo.pqc_status] ?? 10;
    defaultCount++;
  }

  if (orgCount === 0 || defaultCount === 0 || defaultTotal === 0) return 1;

  const orgAvg = orgTotal / orgCount;
  const defaultAvg = defaultTotal / defaultCount;
  const factor = orgAvg / defaultAvg;

  // Clamp to a sensible range so one extreme change can't produce nonsense
  return Math.max(0.5, Math.min(2.0, factor));
}
