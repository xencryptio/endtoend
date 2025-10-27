// src/data/cryptoData.ts

export const codeExamples = {
  kem_examples: {
    vulnerable: {
      description: "RSA-based Key Encapsulation Mechanism vulnerable to quantum attacks via Shor's algorithm",
      code: `from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend
import os

def generate_rsa_key_pair():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    public_key = private_key.public_key()
    return private_key, public_key

def rsa_kem_encapsulate(public_key):
    # Generate a random symmetric key (e.g., for AES)
    symmetric_key = os.urandom(32) # 256-bit key

    # Encrypt the symmetric key with RSA public key
    encrypted_symmetric_key = public_key.encrypt(
        symmetric_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return encrypted_symmetric_key, symmetric_key

def rsa_kem_decapsulate(private_key, encrypted_symmetric_key):
    # Decrypt the symmetric key with RSA private key
    decrypted_symmetric_key = private_key.decrypt(
        encrypted_symmetric_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return decrypted_symmetric_key`,
      vulnerability: `RSA-KEM relies on integer factorization, which Shor's algorithm can efficiently solve on quantum computers, compromising the encapsulated symmetric key.`,
      performance: {
        keySize: '256 bytes (public key)',
        ciphertextSize: '256 bytes',
        encryptionTime: '~100,000 cycles',
        decryptionTime: '~100,000 cycles',
      },
    },
    pqc_compliant: {
      description: 'Lattice-based Key Encapsulation Mechanism resistant to quantum attacks',
      code: `# Conceptual Kyber implementation (requires PQC library)
class KyberKEM:
    def __init__(self, security_level="Kyber768"):
        print(f"Initializing CRYSTALS-Kyber KEM with {security_level} security level.")

    def generate_key_pair(self):
        # In real implementation, calls Kyber key generation
        public_key = b"kyber_public_key_bytes"
        secret_key = b"kyber_secret_key_bytes"
        return public_key, secret_key

    def encapsulate(self, public_key):
        # In real implementation, calls Kyber encapsulation
        ciphertext = b"kyber_ciphertext_bytes"
        shared_secret = b"kyber_shared_secret_bytes"
        return ciphertext, shared_secret

    def decapsulate(self, ciphertext, secret_key):
        # In real implementation, calls Kyber decapsulation
        shared_secret = b"kyber_recovered_shared_secret_bytes"
        return shared_secret

# Usage example
kyber_kem = KyberKEM("Kyber768")
pk, sk = kyber_kem.generate_key_pair()
ct, ss_sender = kyber_kem.encapsulate(pk)
ss_receiver = kyber_kem.decapsulate(ct, sk)`,
      security: 'Based on Module-LWE problem, believed to be resistant to both classical and quantum attacks. No known efficient quantum algorithms exist.',
      performance: {
        keySize: '1184 bytes (public key)',
        ciphertextSize: '1088 bytes',
        encapsulationTime: '67,624 cycles (AVX2)',
        decapsulationTime: '53,156 cycles (AVX2)',
      },
    },
  },
}

export const performanceData = {
  comparison_data: {
    key_sizes: [
      { algorithm: 'RSA-KEM', publicKey: 256 },
      { algorithm: 'CRYSTALS-Kyber', publicKey: 1184 },
    ],
  },
  analysis: {
    size_impact: 'Post-quantum algorithms tend to have larger key and ciphertext sizes.',
    performance_impact: 'Some post-quantum algorithms require more CPU cycles but remain practical.',
    security_benefit: 'Quantum-resistant algorithms offer long-term security against quantum attacks.',
    recommendations: [
      'Adopt hybrid classical + PQC mechanisms during transition.',
      'Use PQC for high-value data today.',
    ],
  },
}
