import { RawApiData, UnifiedData } from './types';

// Transform API data to unified format
export const transformApiDataToUnifiedFormat = (apiData: RawApiData[]): UnifiedData[] => {
  return apiData.map((item, index) => {
    // Extract numeric strength value from strings like "2048-bit", "256-bit", etc.
    const strengthMatch = item.Strength?.match(/(\d+)/);
    const strength = strengthMatch ? parseInt(strengthMatch[1]) : 0;

    // Determine NIST status based on algorithm
    let nistStatus: 'Standardized' | 'Draft' | 'Deprecated' = item["NIST Status"] ? "Standardized" : "Draft";
    if (item.Algorithm === 'SHA-1' || item.Algorithm === 'SSL' || item.Algorithm.includes('MD5')) {
      nistStatus = 'Deprecated';
    }

    // Determine severity based on quantum vulnerability and algorithm type
    let severity: 'Critical' | 'High' | 'Medium' | 'Low' = 'Medium';
    if (item.PQC) {
      severity = 'Low';
    } else if (nistStatus === 'Deprecated' || item.Algorithm === 'SHA-1' || item.Algorithm === 'SSL') {
      severity = 'Critical';
    } else if (item.Type === 'Asymmetric' || item.Algorithm.includes('RSA') || item.Algorithm.includes('ECC')) {
      severity = 'High';
    } else if (item.Type === 'Hash Function' && !item.Algorithm.includes('SHA-3')) {
      severity = 'Medium';
    }

    // Determine status based on PQC and current state
    let status = 'Open';
    if (item.PQC) {
      const pqcStatuses = ['Implemented', 'In Progress', 'Planning'];
      status = pqcStatuses[Math.floor(Math.random() * pqcStatuses.length)];
    } else if (nistStatus === 'Deprecated') {
      status = 'Open';
    } else {
      const regularStatuses = ['Open', 'In Progress', 'Planning', 'Monitoring'];
      status = regularStatuses[Math.floor(Math.random() * regularStatuses.length)];
    }

    // Generate affected systems based on algorithm type
    let affectedSystems = ['General Systems'];
    if (item.Type === 'Protocol') {
      affectedSystems = ['Web Servers', 'API Gateway', 'Load Balancers'];
    } else if (item.Type === 'Asymmetric') {
      affectedSystems = ['PKI Infrastructure', 'Certificate Authority', 'Key Management'];
    } else if (item.Type === 'Hash Function') {
      affectedSystems = ['Database', 'Blockchain', 'Digital Signatures'];
    } else if (item.Type === 'Digital Signature') {
      affectedSystems = ['Code Signing', 'Document Authentication', 'Email Security'];
    } else if (item.Type === 'Key Exchange') {
      affectedSystems = ['VPN', 'TLS Connections', 'Secure Channels'];
    }

    return {
      id: index + 1,
      name: item.Algorithm,
      type: item.Type,
      strength: strength,
      nistStatus: nistStatus,
      isPqc: item.PQC || false,
      usage: item.Usage || 0,
      implementationComplexity: item["Implementation Complexity"] || "Medium",
      description: item.Description || `${item.Algorithm} implementation`,
      quantumVulnerability: item["Quantum Vulnerability"] || (item.PQC ? "Quantum-resistant" : "Vulnerable to quantum attacks"),
      recommendedReplacement: item["Recommended Replacement"] || (item.PQC ? "N/A" : "Upgrade to PQC alternative"),
      performanceImpact: item.PQC ? Math.random() * 0.15 + 0.05 : Math.random() * 0.08 + 0.01,
      adoptionRate: item.PQC ? Math.random() * 0.7 + 0.2 : Math.random() * 0.4,
      // Vulnerability card data
      title: `${item.Algorithm} ${item.Type}`,
      severity: severity,
      affectedSystems: affectedSystems,
      status: status,
      discoveredDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  });
};