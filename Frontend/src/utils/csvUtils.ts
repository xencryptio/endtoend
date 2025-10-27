export interface CSVData {
  [key: string]: string | number;
}

export function parseCSV(csvText: string): CSVData[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data: CSVData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: CSVData = {};
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      // Try to parse as number
      const numValue = parseFloat(value);
      row[header] = isNaN(numValue) ? value : numValue;
    });
    
    data.push(row);
  }

  return data;
}

export function generateSamplePQCData(): CSVData[] {
  return [
    {
      application: "Web Portal",
      pqc_ready: 75,
      vulnerabilities: 12,
      algorithms_used: "CRYSTALS-Kyber, CRYSTALS-Dilithium",
      risk_level: "Medium",
      last_scan: "2024-01-15",
      status: "Active"
    },
    {
      application: "API Gateway", 
      pqc_ready: 90,
      vulnerabilities: 3,
      algorithms_used: "FALCON, SPHINCS+",
      risk_level: "Low",
      last_scan: "2024-01-14",
      status: "Active"
    },
    {
      application: "Database System",
      pqc_ready: 45,
      vulnerabilities: 28,
      algorithms_used: "RSA (Legacy)",
      risk_level: "High", 
      last_scan: "2024-01-13",
      status: "Needs Update"
    },
    {
      application: "Mobile App",
      pqc_ready: 60,
      vulnerabilities: 8,
      algorithms_used: "CRYSTALS-Kyber",
      risk_level: "Medium",
      last_scan: "2024-01-15",
      status: "Active"
    },
    {
      application: "File Server",
      pqc_ready: 85,
      vulnerabilities: 5,
      algorithms_used: "CRYSTALS-Dilithium, FALCON",
      risk_level: "Low",
      last_scan: "2024-01-14", 
      status: "Active"
    }
  ];
}