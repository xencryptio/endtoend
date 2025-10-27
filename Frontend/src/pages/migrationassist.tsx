import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Copy, Shield, AlertTriangle, Code, ArrowLeft, 
  Calendar, Users, CheckCircle, Clock,
  Key, FileSignature, BarChart3, Target
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const codeExamples = {
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
    symmetric_key = os.urandom(32)  # 256-bit key
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
    decrypted_symmetric_key = private_key.decrypt(
        encrypted_symmetric_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return decrypted_symmetric_key`,
      vulnerability: `RSA-KEM relies on integer factorization, which Shor's algorithm can efficiently solve on quantum computers.`,
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
        public_key = b"kyber_public_key_bytes"
        secret_key = b"kyber_secret_key_bytes"
        return public_key, secret_key

    def encapsulate(self, public_key):
        ciphertext = b"kyber_ciphertext_bytes"
        shared_secret = b"kyber_shared_secret_bytes"
        return ciphertext, shared_secret

    def decapsulate(self, ciphertext, secret_key):
        shared_secret = b"kyber_recovered_shared_secret_bytes"
        return shared_secret

kyber_kem = KyberKEM("Kyber768")
pk, sk = kyber_kem.generate_key_pair()
ct, ss_sender = kyber_kem.encapsulate(pk)
ss_receiver = kyber_kem.decapsulate(ct, sk)`,
      security: 'Based on Module-LWE problem, believed to be resistant to quantum attacks.',
      performance: {
        keySize: '1184 bytes (public key)',
        ciphertextSize: '1088 bytes',
        encapsulationTime: '67,624 cycles (AVX2)',
        decapsulationTime: '53,156 cycles (AVX2)',
      },
    },
  },
}

const migrationData = {
  steps: [
    { phase: 'Assessment', description: 'Inventory current cryptographic systems', status: 'complete', timeline: 'Q1 2024' },
    { phase: 'Planning', description: 'Develop migration roadmap', status: 'complete', timeline: 'Q2 2024' },
    { phase: 'Pilot Testing', description: 'Test PQC algorithms in controlled environments', status: 'in-progress', timeline: 'Q3-Q4 2024' },
    { phase: 'Hybrid Implementation', description: 'Deploy hybrid classical+PQC solutions', status: 'pending', timeline: 'Q1-Q2 2025' },
    { phase: 'Full Migration', description: 'Complete transition to PQC', status: 'pending', timeline: 'Q3-Q4 2025' },
  ],
  timeline: [
    { year: '2024', threat: 'Low', quantum: 5, classical: 95 },
    { year: '2025', threat: 'Low-Medium', quantum: 15, classical: 85 },
    { year: '2030', threat: 'Medium', quantum: 40, classical: 60 },
    { year: '2035', threat: 'High', quantum: 70, classical: 30 },
    { year: '2040', threat: 'Critical', quantum: 90, classical: 10 },
  ],
  challenges: [
    { category: 'Technical', items: ['Larger key sizes', 'Performance impact', 'Integration complexity'] },
    { category: 'Operational', items: ['Staff training', 'Legacy system compatibility', 'Cost management'] },
    { category: 'Standards', items: ['Evolving standards', 'Certification processes', 'Interoperability'] },
  ],
  practices: [
    'Start with hybrid implementations',
    'Prioritize high-value assets',
    'Implement crypto-agility',
    'Regular security assessments',
    'Staff training programs',
    'Vendor engagement',
  ]
}

const performanceData = {
  comparison_data: {
    key_sizes: [
      { algorithm: 'RSA-KEM', publicKey: 256, signature: 256 },
      { algorithm: 'CRYSTALS-Kyber', publicKey: 1184, signature: 1088 },
      { algorithm: 'ECDSA', publicKey: 64, signature: 70 },
      { algorithm: 'CRYSTALS-Dilithium', publicKey: 1952, signature: 3293 },
    ],
    security_levels: [
      { algorithm: 'RSA-KEM', classicalSecurity: 112, quantumSecurity: 0 },
      { algorithm: 'CRYSTALS-Kyber', classicalSecurity: 128, quantumSecurity: 128 },
      { algorithm: 'ECDSA', classicalSecurity: 128, quantumSecurity: 0 },
      { algorithm: 'CRYSTALS-Dilithium', classicalSecurity: 128, quantumSecurity: 128 },
    ],
  },
}

function copyToClipboard(code) {
  navigator.clipboard.writeText(code)
}

export default function PQCDashboard() {
  const [expandedCard, setExpandedCard] = useState(null)

  const cards = [
    {
      id: 'migration',
      title: 'Migration Steps',
      description: 'Comprehensive roadmap for PQC adoption',
      icon: <Target className="h-6 w-6" />,
      color: 'bg-blue-500 dark:bg-blue-600',
      content: 'migration'
    },
    {
      id: 'timeline',
      title: 'Threat Timeline',
      description: 'Quantum threat evolution and impact assessment',
      icon: <Calendar className="h-6 w-6" />,
      color: 'bg-orange-500 dark:bg-orange-600',
      content: 'timeline'
    },
    {
      id: 'challenges',
      title: 'Challenges',
      description: 'Key obstacles in PQC implementation',
      icon: <AlertTriangle className="h-6 w-6" />,
      color: 'bg-red-500 dark:bg-red-600',
      content: 'challenges'
    },
    {
      id: 'practices',
      title: 'Best Practices',
      description: 'Proven strategies for successful migration',
      icon: <CheckCircle className="h-6 w-6" />,
      color: 'bg-green-500 dark:bg-green-600',
      content: 'practices'
    },
    {
      id: 'kem',
      title: 'Key Encapsulation (KEM)',
      description: 'Compare RSA-KEM vs CRYSTALS-Kyber',
      icon: <Key className="h-6 w-6" />,
      color: 'bg-purple-500 dark:bg-purple-600',
      content: 'kem'
    },
    {
      id: 'signatures',
      title: 'Digital Signatures',
      description: 'ECDSA vs CRYSTALS-Dilithium comparison',
      icon: <FileSignature className="h-6 w-6" />,
      color: 'bg-indigo-500 dark:bg-indigo-600',
      content: 'signatures'
    },
    {
      id: 'performance',
      title: 'Performance Analysis',
      description: 'Comprehensive performance metrics and charts',
      icon: <BarChart3 className="h-6 w-6" />,
      color: 'bg-teal-500 dark:bg-teal-600',
      content: 'performance'
    }
  ]

  const renderExpandedContent = () => {
    const card = cards.find(c => c.id === expandedCard)
    if (!card) return null

    switch (card.content) {
      case 'migration':
        return (
          <div className="space-y-6">
            <div className="grid gap-4">
              {migrationData.steps.map((step, index) => (
                <Card key={index} className="p-4 border border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-3 h-3 rounded-full ${
                        step.status === 'complete' ? 'bg-green-500' :
                        step.status === 'in-progress' ? 'bg-yellow-500' : 'bg-muted'
                      }`} />
                      <div>
                        <h3 className="font-semibold text-foreground">{step.phase}</h3>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={
                        step.status === 'complete' ? 'default' :
                        step.status === 'in-progress' ? 'secondary' : 'outline'
                      }>
                        {step.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{step.timeline}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )

      case 'timeline':
        return (
          <div className="space-y-6">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={migrationData.timeline}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="year" />
                <YAxis />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--foreground))'
                  }}
                />
                <Line type="monotone" dataKey="quantum" stroke="#ff6b6b" strokeWidth={3} name="Quantum Threat %" />
                <Line type="monotone" dataKey="classical" stroke="#4ecdc4" strokeWidth={3} name="Classical Security %" />
              </LineChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {migrationData.timeline.map((item, index) => (
                <Card key={index} className="p-4 text-center bg-card border-border">
                  <h3 className="font-bold text-lg text-foreground">{item.year}</h3>
                  <Badge className={`mt-2 ${
                    item.threat === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    item.threat === 'Low-Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    item.threat === 'Medium' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                    item.threat === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-red-500 text-white dark:bg-red-600'
                  }`}>
                    {item.threat}
                  </Badge>
                </Card>
              ))}
            </div>
          </div>
        )

      case 'challenges':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {migrationData.challenges.map((challenge, index) => (
              <Card key={index} className="p-6 bg-card border-border">
                <h3 className="font-bold text-lg mb-4 text-center text-foreground">{challenge.category}</h3>
                <ul className="space-y-2">
                  {challenge.items.map((item, idx) => (
                    <li key={idx} className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="text-sm text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )

      case 'practices':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {migrationData.practices.map((practice, index) => (
              <Card key={index} className="p-4 hover:shadow-md transition-shadow bg-card border-border">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-foreground">{practice}</span>
                </div>
              </Card>
            ))}
          </div>
        )

      case 'kem':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* RSA-KEM */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-foreground">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      <span>RSA-KEM (Vulnerable)</span>
                    </CardTitle>
                    <Badge variant="destructive">Quantum Vulnerable</Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">{codeExamples.kem_examples.vulnerable.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg relative">
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(codeExamples.kem_examples.vulnerable.code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <pre className="text-sm overflow-x-auto whitespace-pre-wrap text-foreground">
                      <code>{codeExamples.kem_examples.vulnerable.code}</code>
                    </pre>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <h4 className="font-semibold text-red-600 dark:text-red-400">Vulnerability:</h4>
                    <p>{codeExamples.kem_examples.vulnerable.vulnerability}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-foreground">
                    {Object.entries(codeExamples.kem_examples.vulnerable.performance).map(([k, v]) => (
                      <div key={k}>
                        <span className="font-medium">{k.replace(/([A-Z])/g, ' $1')}: </span>{v}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Kyber PQC */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-foreground">
                      <Shield className="h-5 w-5 text-green-500" />
                      <span>CRYSTALS-Kyber (PQC)</span>
                    </CardTitle>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Quantum Resistant</Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">{codeExamples.kem_examples.pqc_compliant.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg relative">
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(codeExamples.kem_examples.pqc_compliant.code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <pre className="text-sm overflow-x-auto whitespace-pre-wrap text-foreground">
                      <code>{codeExamples.kem_examples.pqc_compliant.code}</code>
                    </pre>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <h4 className="font-semibold text-green-600 dark:text-green-400">Security:</h4>
                    <p>{codeExamples.kem_examples.pqc_compliant.security}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-foreground">
                    {Object.entries(codeExamples.kem_examples.pqc_compliant.performance).map(([k, v]) => (
                      <div key={k}>
                        <span className="font-medium">{k.replace(/([A-Z])/g, ' $1')}: </span>{v}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case 'signatures':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ECDSA Vulnerable Card */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-foreground">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      <span>ECDSA (Vulnerable)</span>
                    </CardTitle>
                    <Badge variant="destructive">Quantum Vulnerable</Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">
                    Elliptic Curve Digital Signature Algorithm vulnerable to quantum attacks via Shor's algorithm.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg relative">
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(`from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend

def generate_ecdsa_key_pair():
    private_key = ec.generate_private_key(
        ec.SECP256R1(),  # A common elliptic curve
        default_backend()
    )
    public_key = private_key.public_key()
    return private_key, public_key

def ecdsa_sign(private_key, message):
    signature = private_key.sign(
        message,
        ec.ECDSA(hashes.SHA256())
    )
    return signature

def ecdsa_verify(public_key, message, signature):
    try:
        public_key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False

# Usage example
private_key, public_key = generate_ecdsa_key_pair()
message = b"This is a test message"
signature = ecdsa_sign(private_key, message)
is_valid = ecdsa_verify(public_key, message, signature)`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <pre className="text-sm overflow-x-auto whitespace-pre-wrap text-foreground">
                      <code>{`from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend

def generate_ecdsa_key_pair():
    private_key = ec.generate_private_key(
        ec.SECP256R1(),  # A common elliptic curve
        default_backend()
    )
    public_key = private_key.public_key()
    return private_key, public_key

def ecdsa_sign(private_key, message):
    signature = private_key.sign(
        message,
        ec.ECDSA(hashes.SHA256())
    )
    return signature

def ecdsa_verify(public_key, message, signature):
    try:
        public_key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False

# Usage example
private_key, public_key = generate_ecdsa_key_pair()
message = b"This is a test message"
signature = ecdsa_sign(private_key, message)
is_valid = ecdsa_verify(public_key, message, signature)`}</code>
                    </pre>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <h4 className="font-semibold text-red-600 dark:text-red-400">Vulnerability:</h4>
                    <p>ECDSA relies on the ECDLP, which Shor's algorithm can efficiently solve, allowing signature forgery.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-foreground">
                    <div><strong>Key Size:</strong> 64 bytes</div>
                    <div><strong>Signature:</strong> 64-72 bytes</div>
                    <div><strong>Signing:</strong> ~10,000 cycles</div>
                    <div><strong>Verification:</strong> ~10,000 cycles</div>
                  </div>
                </CardContent>
              </Card>

              {/* Dilithium PQC Card */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2 text-foreground">
                      <Shield className="h-5 w-5 text-green-500" />
                      <span>CRYSTALS-Dilithium (PQC)</span>
                    </CardTitle>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Quantum Resistant</Badge>
                  </div>
                  <CardDescription className="text-muted-foreground">Lattice-based Digital Signature Algorithm resistant to quantum attacks.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted p-4 rounded-lg relative">
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(`# Conceptual Dilithium implementation
class DilithiumSignature:
    def __init__(self, security_level="Dilithium3"):
        print(f"Initializing CRYSTALS-Dilithium with {security_level} security level.")

    def generate_key_pair(self):
        # In real implementation, calls Dilithium key generation
        public_key = b"dilithium_public_key_bytes"
        secret_key = b"dilithium_secret_key_bytes"
        return public_key, secret_key

    def sign(self, message, secret_key):
        # In real implementation, calls Dilithium signing
        signature = b"dilithium_signature_bytes"
        return signature

    def verify(self, message, signature, public_key):
        # In real implementation, calls Dilithium verification
        return True  # Placeholder

# Usage example
dilithium_signer = DilithiumSignature("Dilithium3")
pk, sk = dilithium_signer.generate_key_pair()
message = b"This is a test message"
signature = dilithium_signer.sign(message, sk)
is_valid = dilithium_signer.verify(message, signature, pk)`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <pre className="text-sm overflow-x-auto whitespace-pre-wrap text-foreground">
                      <code>{`# Conceptual Dilithium implementation (requires PQC library)
class DilithiumSignature:
    def __init__(self, security_level="Dilithium3"):
        print(f"Initializing CRYSTALS-Dilithium with {security_level} security level.")

    def generate_key_pair(self):
        # In real implementation, calls Dilithium key generation
        public_key = b"dilithium_public_key_bytes"
        secret_key = b"dilithium_secret_key_bytes"
        return public_key, secret_key

    def sign(self, message, secret_key):
        # In real implementation, calls Dilithium signing
        signature = b"dilithium_signature_bytes"
        return signature

    def verify(self, message, signature, public_key):
        # In real implementation, calls Dilithium verification
        return True  # Placeholder

# Usage example
dilithium_signer = DilithiumSignature("Dilithium3")
pk, sk = dilithium_signer.generate_key_pair()
message = b"This is a test message"
signature = dilithium_signer.sign(message, sk)
is_valid = dilithium_signer.verify(message, signature, pk)`}</code>
                    </pre>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <h4 className="font-semibold text-green-600 dark:text-green-400">Security:</h4>
                    <p>Based on SIS/LWE problems, believed to be quantum-resistant with no known efficient quantum attacks.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-foreground">
                    <div><strong>Key Size:</strong> 1952 bytes</div>
                    <div><strong>Signature:</strong> 3293 bytes</div>
                    <div><strong>Signing:</strong> 529,106 cycles (AVX2)</div>
                    <div><strong>Verification:</strong> 179,424 cycles (AVX2)</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case 'performance':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Key Size Comparison</CardTitle>
                  <CardDescription className="text-muted-foreground">Comparison of key sizes between classical and PQC algorithms</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={performanceData.comparison_data.key_sizes}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="algorithm" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip 
                        formatter={(value) => [`${value} bytes`, 'Size']} 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Bar dataKey="publicKey" fill="#8884d8" name="Public Key" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Security Level Comparison</CardTitle>
                  <CardDescription className="text-muted-foreground">Classical vs Quantum security levels</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={performanceData.comparison_data.security_levels}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="algorithm" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Bar dataKey="classicalSecurity" fill="#ff7300" name="Classical Security" />
                      <Bar dataKey="quantumSecurity" fill="#00ff00" name="Quantum Security" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Performance Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">Size Impact:</h4>
                    <p className="text-sm text-muted-foreground">Post-quantum algorithms tend to have larger key and ciphertext sizes.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">Performance Impact:</h4>
                    <p className="text-sm text-muted-foreground">Some post-quantum algorithms require more CPU cycles but remain practical.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">Security Benefit:</h4>
                    <p className="text-sm text-muted-foreground">Quantum-resistant algorithms offer long-term security against quantum attacks.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-foreground">Recommendations:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Adopt hybrid classical + PQC mechanisms during transition.</li>
                      <li>• Use PQC for high-value data today.</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  if (expandedCard) {
    return (
      <motion.div
        className="min-h-screen bg-background p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-4 mb-6">
            <Button
              variant="outline"
              onClick={() => setExpandedCard(null)}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </Button>
            <div className="flex items-center space-x-2">
              <div className={`p-2 rounded-lg text-white ${cards.find(c => c.id === expandedCard)?.color}`}>
                {cards.find(c => c.id === expandedCard)?.icon}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">{cards.find(c => c.id === expandedCard)?.title}</h1>
                <p className="text-muted-foreground">{cards.find(c => c.id === expandedCard)?.description}</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
            {renderExpandedContent()}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="min-h-screen bg-background p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <h1 className="text-4xl font-bold text-foreground">Migration assist</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cards.map((card) => (
            <Card
              key={card.id}
              className="group cursor-pointer transform transition-all duration-300 hover:scale-105 hover:shadow-xl border-0 bg-card"
              onClick={() => setExpandedCard(card.id)}
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className={`p-4 rounded-full text-white ${card.color} group-hover:scale-110 transition-transform duration-300`}>
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{card.title}</h3>
                    <p className="text-sm text-muted-foreground">{card.description}</p>
                  </div>
                  <div className="w-full pt-4 border-t border-border">
                    <div className="flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                      <span className="text-sm font-medium mr-2">Explore</span>
                      <ArrowLeft className="h-4 w-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 bg-card rounded-lg shadow-sm p-8 border border-border">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">Quick Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">Quantum Threat</h3>
                <p className="text-sm text-muted-foreground">Current cryptographic systems will be vulnerable to quantum computers</p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                  <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">Migration Timeline</h3>
                <p className="text-sm text-muted-foreground">Organizations need to start planning and implementing PQC now</p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                  <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold mb-2 text-foreground">PQC Solution</h3>
                <p className="text-sm text-muted-foreground">New algorithms designed to resist both classical and quantum attacks</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}