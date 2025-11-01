import React, { useState, useEffect } from 'react';
import { ChevronRight, Shield, FileText, Download, Building2, AlertTriangle } from 'lucide-react';
import html2pdf from 'html2pdf.js';

const ReadinessAnalysis = () => {
  const [currentSection, setCurrentSection] = useState(-1);
  const [answers, setAnswers] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    industry: '',
    size: '',
    dataTypes: ''
  });

  const questions = [
    {
      section: "PQC Awareness and Understanding",
      items: [
        {
          id: 'q1',
          question: 'How familiar is your organization with the concept of Post-Quantum Cryptography (PQC) and quantum computing threats?',
          options: [
            { value: 4, label: 'Comprehensive understanding with dedicated training programs and executive awareness' },
            { value: 3, label: 'Good understanding among security teams with documented threat assessments' },
            { value: 2, label: 'Basic awareness with some research conducted' },
            { value: 1, label: 'Limited awareness, just beginning to explore the topic' },
            { value: 0, label: 'No awareness or understanding of quantum threats' }
          ]
        },
        {
          id: 'q2',
          question: 'Does your organization understand the "harvest now, decrypt later" threat where encrypted data is collected today for future decryption?',
          options: [
            { value: 4, label: 'Yes, with quantified risk assessment and mitigation strategies in place' },
            { value: 3, label: 'Yes, security team understands and has documented the risk' },
            { value: 2, label: 'Partial understanding, still evaluating the impact' },
            { value: 1, label: 'Heard about it but not fully understood' },
            { value: 0, label: 'Not aware of this threat' }
          ]
        },
        {
          id: 'q3',
          question: 'Is your organization aware of NIST\'s standardized post-quantum cryptographic algorithms (ML-KEM, ML-DSA, SLH-DSA)?',
          options: [
            { value: 4, label: 'Yes, actively tracking standards and planning implementation' },
            { value: 3, label: 'Yes, aware of the standards and evaluating them' },
            { value: 2, label: 'Some awareness but limited understanding' },
            { value: 1, label: 'Just heard about NIST involvement' },
            { value: 0, label: 'Not aware of NIST standards' }
          ]
        }
      ]
    },
    {
      section: "Cryptographic Asset Discovery",
      items: [
        {
          id: 'q4',
          question: 'Does your organization have visibility into all cryptographic assets across your infrastructure (applications, APIs, certificates, keys)?',
          options: [
            { value: 4, label: 'Complete automated discovery with real-time monitoring across all environments' },
            { value: 3, label: 'Good visibility for most systems with documented inventory' },
            { value: 2, label: 'Partial visibility, manually tracked for critical systems only' },
            { value: 1, label: 'Limited visibility, no comprehensive inventory' },
            { value: 0, label: 'No visibility into cryptographic assets' }
          ]
        },
        {
          id: 'q5',
          question: 'Can you identify which cryptographic algorithms (RSA, ECC, AES key sizes) are being used across your entire technology stack?',
          options: [
            { value: 4, label: 'Yes, automated tools provide complete algorithm identification with version tracking' },
            { value: 3, label: 'Yes, for most systems through manual audit and documentation' },
            { value: 2, label: 'Partially, only for known critical applications' },
            { value: 1, label: 'Very limited, scattered information' },
            { value: 0, label: 'No, unable to identify algorithms in use' }
          ]
        },
        {
          id: 'q6',
          question: 'How quickly can your team detect when new quantum-vulnerable cryptographic implementations are introduced into your environment?',
          options: [
            { value: 4, label: 'Immediately through automated continuous monitoring and alerting' },
            { value: 3, label: 'Within days through regular scanning' },
            { value: 2, label: 'Within weeks through periodic audits' },
            { value: 1, label: 'Only during major security reviews (months)' },
            { value: 0, label: 'Cannot detect new implementations' }
          ]
        }
      ]
    },
    {
      section: "Quantum-Readiness Roadmap",
      items: [
        {
          id: 'q7',
          question: 'Has your organization established a dedicated project team or working group specifically for Post-Quantum Cryptography (PQC) migration?',
          options: [
            { value: 4, label: 'Yes, with dedicated full-time resources and executive sponsorship' },
            { value: 3, label: 'Yes, with part-time resources and defined responsibilities' },
            { value: 2, label: 'Informally, with ad-hoc involvement from security team' },
            { value: 1, label: 'No, but planning to establish one' },
            { value: 0, label: 'No formal team or plans' }
          ]
        },
        {
          id: 'q8',
          question: 'What is the current status of your organization\'s PQC migration roadmap?',
          options: [
            { value: 4, label: 'Comprehensive roadmap with timelines, milestones, and resource allocation' },
            { value: 3, label: 'Documented roadmap with key phases identified' },
            { value: 2, label: 'Preliminary roadmap under development' },
            { value: 1, label: 'Initial discussions only' },
            { value: 0, label: 'No roadmap exists' }
          ]
        },
        {
          id: 'q9',
          question: 'How frequently does executive leadership receive updates on PQC readiness and quantum risk?',
          options: [
            { value: 4, label: 'Monthly or more frequent structured updates with risk metrics' },
            { value: 3, label: 'Quarterly updates with documented progress' },
            { value: 2, label: 'Semi-annual or ad-hoc updates' },
            { value: 1, label: 'Only during annual planning cycles' },
            { value: 0, label: 'No formal communication established' }
          ]
        }
      ]
    },
    {
      section: "Cryptographic Inventory Management",
      items: [
        {
          id: 'q10',
          question: 'Is your cryptographic inventory integrated with existing IT asset management, CMDB, or security tools?',
          options: [
            { value: 4, label: 'Fully integrated with automated correlation and continuous monitoring' },
            { value: 3, label: 'Partially integrated with some manual reconciliation' },
            { value: 2, label: 'Standalone inventory with manual cross-referencing' },
            { value: 1, label: 'Integration planned but not implemented' },
            { value: 0, label: 'No integration exists or planned' }
          ]
        },
        {
          id: 'q11',
          question: 'Have you identified and prioritized quantum-vulnerable cryptographic algorithms based on business criticality?',
          options: [
            { value: 4, label: 'Complete identification with risk scoring and prioritization matrix' },
            { value: 3, label: 'Identified for most systems with documented locations' },
            { value: 2, label: 'Identified for critical systems only' },
            { value: 1, label: 'Preliminary identification in progress' },
            { value: 0, label: 'Not yet identified' }
          ]
        }
      ]
    },
    {
      section: "Vendor and Technology Provider Engagement",
      items: [
        {
          id: 'q12',
          question: 'How systematically are you engaging with technology vendors regarding their PQC roadmaps?',
          options: [
            { value: 4, label: 'Formal program with standardized questionnaires and regular vendor reviews' },
            { value: 3, label: 'Structured outreach to critical vendors with documented responses' },
            { value: 2, label: 'Informal discussions with select key vendors' },
            { value: 1, label: 'Initial inquiries to a few vendors' },
            { value: 0, label: 'No vendor engagement on PQC' }
          ]
        },
        {
          id: 'q13',
          question: 'Do your procurement contracts and vendor agreements include PQC requirements or quantum-readiness clauses?',
          options: [
            { value: 4, label: 'Standard contractual language in all new and renewed agreements with compliance verification' },
            { value: 3, label: 'PQC requirements included in contracts for critical systems' },
            { value: 2, label: 'Under development with legal and procurement teams' },
            { value: 1, label: 'Discussed but not yet implemented' },
            { value: 0, label: 'Not included in any contracts' }
          ]
        }
      ]
    },
    {
      section: "Supply Chain Quantum-Readiness",
      items: [
        {
          id: 'q14',
          question: 'How comprehensively have you mapped your software and hardware supply chain for quantum vulnerabilities?',
          options: [
            { value: 4, label: 'Complete supply chain mapping with dependency analysis and risk assessment' },
            { value: 3, label: 'Mapped critical dependencies with documented relationships' },
            { value: 2, label: 'Partial mapping of major suppliers and components' },
            { value: 1, label: 'Initial identification of key suppliers only' },
            { value: 0, label: 'No supply chain mapping conducted' }
          ]
        },
        {
          id: 'q15',
          question: 'Have you assessed the PQC readiness of your cloud service providers (AWS, Azure, GCP, etc.)?',
          options: [
            { value: 4, label: 'Comprehensive assessment with documented PQC enablement plans and SLAs' },
            { value: 3, label: 'Engaged with providers and reviewed their published roadmaps' },
            { value: 2, label: 'Initial discussions with major providers' },
            { value: 1, label: 'Aware of the need but not yet engaged' },
            { value: 0, label: 'Not assessed or not applicable' }
          ]
        }
      ]
    },
    {
      section: "Compliance and Risk Management",
      items: [
        {
          id: 'q16',
          question: 'How are quantum computing threats incorporated into your organization\'s risk management framework?',
          options: [
            { value: 4, label: 'Fully integrated with quantified risk metrics and board-level reporting' },
            { value: 3, label: 'Documented in risk register with assigned ownership' },
            { value: 2, label: 'Acknowledged in risk assessments but not formalized' },
            { value: 1, label: 'Under consideration for inclusion' },
            { value: 0, label: 'Not incorporated into risk management' }
          ]
        },
        {
          id: 'q17',
          question: 'Are regulatory and compliance requirements related to PQC (NIST standards, industry mandates) being tracked and incorporated into planning?',
          options: [
            { value: 4, label: 'Active monitoring with compliance roadmap aligned to regulatory timelines' },
            { value: 3, label: 'Tracking major standards with periodic reviews' },
            { value: 2, label: 'Aware of key standards but limited tracking' },
            { value: 1, label: 'Minimal awareness of regulatory landscape' },
            { value: 0, label: 'Not tracking compliance requirements' }
          ]
        }
      ]
    }
  ];

  const allQuestions = questions.flatMap(section => 
    section.items.map(item => ({ ...item, section: section.section }))
  );

  const handleAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const calculateScores = () => {
    const sectionScores = questions.map(section => {
      const sectionQuestions = section.items.map(item => item.id);
      const totalPoints = sectionQuestions.reduce((sum, qId) => sum + (answers[qId] || 0), 0);
      const maxPoints = sectionQuestions.length * 4;
      const percentage = (totalPoints / maxPoints) * 100;
      
      return {
        section: section.section,
        score: percentage,
        level: getMaturityLevel(percentage),
        totalPoints,
        maxPoints
      };
    });

    const overallScore = sectionScores.reduce((sum, s) => sum + s.score, 0) / sectionScores.length;
    
    return { sectionScores, overallScore };
  };

  const getMaturityLevel = (score) => {
    if (score >= 85) return 'Advanced';
    if (score >= 70) return 'Maturing';
    if (score >= 50) return 'Developing';
    if (score >= 30) return 'Initiated';
    return 'Not Started';
  };

  const getMaturityColor = (level) => {
    const colors = {
      'Advanced': 'text-green-600',
      'Maturing': 'text-blue-600',
      'Developing': 'text-yellow-600',
      'Initiated': 'text-orange-600',
      'Not Started': 'text-red-600'
    };
    return colors[level] || 'text-muted-foreground';
  };

  const generateReport = () => {
    setShowReport(true);
  };

  const downloadPDF = () => {
    const element = document.getElementById('pqc-report');
    const opt = {
      margin: 10,
      filename: `PQC-Readiness-Report-${companyInfo.name}-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, logging: false, dpi: 192, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save();
  };

  const currentQuestion = allQuestions[currentSection];
  const progress = currentSection >= 0 ? ((currentSection + 1) / allQuestions.length) * 100 : 0;

  // Report View
  if (showReport) {
    const { sectionScores, overallScore } = calculateScores();
    const overallLevel = getMaturityLevel(overallScore);

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto bg-card shadow-2xl rounded-lg overflow-hidden">
          <div id="pqc-report">
            <div className="bg-primary text-primary-foreground p-8">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-10 h-10" />
                <div>
                  <h1 className="text-3xl font-bold">Post-Quantum Cryptography</h1>
                  <p className="text-blue-200">Readiness Assessment Report</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-200">Organization</p>
                  <p className="font-semibold text-lg">{companyInfo.name || 'Not Specified'}</p>
                </div>
                <div>
                  <p className="text-blue-200">Industry</p>
                  <p className="font-semibold text-lg">{companyInfo.industry || 'Not Specified'}</p>
                </div>
                <div>
                  <p className="text-blue-200">Organization Size</p>
                  <p className="font-semibold text-lg">{companyInfo.size || 'Not Specified'}</p>
                </div>
                <div>
                  <p className="text-blue-200">Assessment Date</p>
                  <p className="font-semibold text-lg">{new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="p-8 border-b bg-amber-50">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-4">The Quantum Threat: Why PQC Matters Now</h2>
                  <p className="text-foreground/80 leading-relaxed mb-4">
                    Quantum computers pose an existential threat to current cryptographic systems. Organizations must act now to protect their data from both present and future quantum attacks.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-card p-4 rounded-lg border-l-4 border-red-600">
                  <h3 className="font-bold text-foreground mb-2">🎯 "Harvest Now, Decrypt Later" Attacks</h3>
                  <p className="text-sm text-foreground/80">Adversaries are collecting encrypted data today to decrypt once quantum computers are available. Data with long-term sensitivity is at immediate risk.</p>
                </div>
                <div className="bg-white p-4 rounded-lg border-l-4 border-orange-600">
                  <h3 className="font-bold text-gray-900 mb-2">⏰ Timeline Pressure</h3>
                  <p className="text-sm text-gray-700">NIST estimates organizations need 10-15 years for full cryptographic migration. With quantum advantage potentially arriving by 2030-2035, the window is closing.</p>
                </div>
                <div className="bg-white p-4 rounded-lg border-l-4 border-blue-600">
                  <h3 className="font-bold text-gray-900 mb-2">💰 Financial Impact</h3>
                  <p className="text-sm text-foreground/80">McKinsey estimates quantum computing market will reach $100B+ by 2035. Organizations unprepared for quantum threats face regulatory fines, data breaches, and competitive disadvantage.</p>
                </div>
                <div className="bg-white p-4 rounded-lg border-l-4 border-green-600">
                  <h3 className="font-bold text-gray-900 mb-2">📋 Regulatory Mandates</h3>
                  <p className="text-sm text-foreground/80">US OMB Memo M-23-02 requires federal agencies to transition to PQC. NIST published final PQC standards (FIPS 203, 204, 205) in August 2024, triggering compliance timelines.</p>
                </div>
              </div>

              <div className="bg-primary text-primary-foreground p-4 rounded-lg">
                <p className="font-semibold mb-2">Key Statistics:</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>74% of security leaders view quantum computing as a threat (IBM Security, 2023)</li>
                  <li>89% of organizations handle data requiring 10+ years of protection (Deloitte, 2024)</li>
                  <li>Only 23% of enterprises have begun PQC migration planning (Gartner, 2024)</li>
                  <li>Average enterprise has 500+ cryptographic implementations to migrate (IDC, 2024)</li>
                </ul>
              </div>
            </div>

            <div className="p-8 border-b">
              <h2 className="text-2xl font-bold text-foreground mb-4">Executive Summary</h2>
              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Overall PQC Readiness Score</p>
                    <p className="text-5xl font-bold text-blue-900">{overallScore.toFixed(1)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Maturity Level</p>
                    <p className={`text-3xl font-bold ${getMaturityColor(overallLevel)}`}>{overallLevel}</p>
                  </div>
                </div>
              </div>
              
              <p className="text-foreground/80 leading-relaxed mb-4">
                This report presents a comprehensive Post-Quantum Cryptography (PQC) readiness assessment conducted on {new Date().toLocaleDateString()}. The assessment evaluates the organization's current posture regarding PQC migration across seven critical components.
              </p>
              
              <p className="text-foreground/80 leading-relaxed">
                {overallLevel === 'Advanced' && 
                  'The organization demonstrates strong PQC readiness with comprehensive programs across all assessment areas. Focus should be on maintaining momentum and continuous improvement through automated monitoring.'
                }
                {overallLevel === 'Maturing' && 
                  'The organization shows solid progress in PQC readiness with established programs in key areas. Continued investment in automation and comprehensive coverage will advance readiness posture.'
                }
                {overallLevel === 'Developing' && 
                  'The organization has initiated PQC readiness efforts with foundational programs in place. Significant opportunities exist for improvement, particularly in automated discovery and systematic execution.'
                }
                {overallLevel === 'Initiated' && 
                  'The organization is in early stages of PQC readiness with limited programs established. Immediate action is required to accelerate migration planning, particularly around cryptographic asset discovery and inventory management.'
                }
                {overallLevel === 'Not Started' && 
                  'The organization has minimal to no PQC readiness programs in place. Urgent executive attention and immediate deployment of cryptographic discovery tools are required to address quantum computing threats.'
                }
              </p>
            </div>

            <div className="p-8 border-b">
              <h2 className="text-2xl font-bold text-foreground mb-6">Detailed Component Analysis</h2>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">Core Component</th>
                      <th className="border border-border px-4 py-3 text-center font-semibold text-foreground">Score</th>
                      <th className="border border-border px-4 py-3 text-center font-semibold text-foreground">Maturity Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionScores.map((section, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border border-border px-4 py-3 text-gray-800">{section.section}</td>
                        <td className="border border-border px-4 py-3 text-center font-semibold text-foreground">
                          {section.score.toFixed(1)}%
                        </td>
                        <td className={`border border-border px-4 py-3 text-center font-semibold ${getMaturityColor(section.level)}`}>
                          {section.level}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-blue-100 font-bold">
                      <td className="border border-border px-4 py-3 text-foreground">Overall PQC Readiness Score</td>
                      <td className="border border-border px-4 py-3 text-center text-blue-900">
                        {overallScore.toFixed(1)}%
                      </td>
                      <td className={`border border-gray-300 px-4 py-3 text-center ${getMaturityColor(overallLevel)}`}>
                        {overallLevel}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {sectionScores.map((section, idx) => (
                <div key={idx} className="mb-6 bg-muted/50 p-6 rounded-lg">
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {idx + 1}. {section.section} 
                    <span className="ml-3 text-lg">
                      (Score: {section.score.toFixed(1)}% - <span className={getMaturityColor(section.level)}>{section.level}</span>)
                    </span>
                  </h3>
                  <div className="bg-gray-200 rounded-full h-3 mb-4">
                    <div 
                      className={`h-3 rounded-full ${
                        section.level === 'Advanced' ? 'bg-green-600' :
                        section.level === 'Maturing' ? 'bg-blue-600' :
                        section.level === 'Developing' ? 'bg-yellow-600' :
                        section.level === 'Initiated' ? 'bg-orange-600' : 'bg-red-600'
                      }`}
                      style={{ width: `${section.score}%` }}
                    ></div>
                  </div>
                  <p className="text-foreground/80 leading-relaxed">
                    {section.level === 'Advanced' && 
                      `Excellent progress demonstrated in ${section.section.toLowerCase()}. The organization has implemented comprehensive programs with mature processes and strong governance.`
                    }
                    {section.level === 'Maturing' && 
                      `Good progress in ${section.section.toLowerCase()} with established programs and documented processes. Continue refinement and expansion of existing initiatives.`
                    }
                    {section.level === 'Developing' && 
                      `Foundational work underway in ${section.section.toLowerCase()}. Significant opportunity exists to strengthen programs through systematic approaches and increased investment.`
                    }
                    {section.level === 'Initiated' && 
                      `Early stage development in ${section.section.toLowerCase()}. Immediate focus required to establish formal programs and accelerate progress.`
                    }
                    {section.level === 'Not Started' && 
                      `Critical gap identified in ${section.section.toLowerCase()}. Urgent action required to initiate programs and address fundamental requirements.`
                    }
                  </p>
                </div>
              ))}
            </div>

            <div className="p-8 border-b bg-gradient-to-br from-blue-50 to-indigo-50">
              <h2 className="text-2xl font-bold text-foreground mb-6">How Our PQC Solution Addresses Your Challenges</h2>
              
              <p className="text-foreground/80 leading-relaxed mb-6">
                Our enterprise-grade cryptographic asset discovery and remediation platform is purpose-built to accelerate your PQC migration journey and maintain continuous quantum resilience.
              </p>

              <div className="space-y-4 mb-6">
                <div className="bg-card p-5 rounded-lg shadow-md border-l-4 border-blue-600">
                  <h3 className="text-lg font-bold text-foreground mb-2">🔍 Automated Cryptographic Discovery</h3>
                  <p className="text-foreground/80 mb-2"><strong>Challenge Addressed:</strong> Organizations struggle to identify all cryptographic assets across complex, distributed environments.</p>
                  <p className="text-foreground/80"><strong>Our Solution:</strong> Automated scanning across applications, APIs, containers, microservices, and cloud infrastructure with real-time discovery and version tracking.</p>
                </div>

                <div className="bg-card p-5 rounded-lg shadow-md border-l-4 border-green-600">
                  <h3 className="text-lg font-bold text-foreground mb-2">📊 Risk Prioritization & Impact Analysis</h3>
                  <p className="text-foreground/80 mb-2"><strong>Challenge Addressed:</strong> Not all cryptographic assets pose equal quantum risk. Resources must be focused on highest-impact migrations first.</p>
                  <p className="text-foreground/80"><strong>Our Solution:</strong> Intelligent risk scoring based on data sensitivity, exposure duration, compliance requirements, and business criticality.</p>
                </div>

                <div className="bg-card p-5 rounded-lg shadow-md border-l-4 border-purple-600">
                  <h3 className="text-lg font-bold text-foreground mb-2">🔄 Migration Planning & Remediation Workflows</h3>
                  <p className="text-foreground/80 mb-2"><strong>Challenge Addressed:</strong> Complex interdependencies make migration planning difficult.</p>
                  <p className="text-foreground/80"><strong>Our Solution:</strong> Automated dependency mapping with pre-built migration templates and workflow management.</p>
                </div>

                <div className="bg-card p-5 rounded-lg shadow-md border-l-4 border-orange-600">
                  <h3 className="text-lg font-bold text-foreground mb-2">👥 Vendor & Supply Chain Management</h3>
                  <p className="text-foreground/80 mb-2"><strong>Challenge Addressed:</strong> Limited visibility into third-party cryptographic implementations.</p>
                  <p className="text-foreground/80"><strong>Our Solution:</strong> Automated vendor questionnaire distribution, supply chain risk assessment, and cloud provider monitoring.</p>
                </div>

                <div className="bg-card p-5 rounded-lg shadow-md border-l-4 border-red-600">
                  <h3 className="text-lg font-bold text-foreground mb-2">📈 Continuous Monitoring & Compliance</h3>
                  <p className="text-foreground/80 mb-2"><strong>Challenge Addressed:</strong> New quantum-vulnerable crypto can be introduced through development, acquisitions, or updates.</p>
                  <p className="text-foreground/80"><strong>Our Solution:</strong> Real-time monitoring with automated alerts, compliance dashboards, and executive reporting.</p>
                </div>
              </div>

              <div className="bg-primary text-primary-foreground p-6 rounded-lg">
                <h3 className="text-xl font-bold mb-3">Platform Capabilities Summary</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-semibold mb-2">Discovery & Inventory:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Multi-cloud and hybrid environment support</li>
                      <li>Containerized and microservices scanning</li>
                      <li>Source code static analysis integration</li>
                      <li>Certificate and key management discovery</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-2">Automation & Intelligence:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>ML-powered risk prediction models</li>
                      <li>Automated remediation recommendations</li>
                      <li>Policy-based governance enforcement</li>
                      <li>API-first architecture for integration</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-2">Compliance & Reporting:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Pre-built compliance frameworks</li>
                      <li>Audit trail and change tracking</li>
                      <li>Executive dashboards and KPIs</li>
                      <li>Regulatory timeline alignment</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-2">Enterprise Features:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Role-based access control (RBAC)</li>
                      <li>Multi-tenant architecture</li>
                      <li>SOC 2 Type II certified platform</li>
                      <li>24/7 enterprise support and SLAs</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8">
              <h2 className="text-2xl font-bold text-foreground mb-6">Strategic Recommendations</h2>
              
              <div className="space-y-6">
                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">1. Enhance PQC Awareness and Education</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Conduct executive briefings on quantum threats and business impact</li>
                    <li>Implement organization-wide PQC awareness training program</li>
                    <li>Establish quantum risk as a standing item in security governance meetings</li>
                    <li>Develop internal champions across IT, security, compliance, and business units</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">2. Deploy Automated Cryptographic Discovery</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Implement automated scanning tools to create comprehensive cryptographic inventory</li>
                    <li>Integrate discovery platform with existing asset management and security tools</li>
                    <li>Establish continuous monitoring for new cryptographic implementations</li>
                    <li>Prioritize discovery of business-critical and compliance-regulated systems first</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">3. Establish Quantum-Readiness Roadmap</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Form dedicated PQC migration team with executive sponsorship</li>
                    <li>Define clear milestones with accountability and resource allocation</li>
                    <li>Conduct comprehensive business impact analysis across all critical systems</li>
                    <li>Align migration timeline to regulatory requirements and industry standards</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">4. Mature Cryptographic Inventory Management</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Implement risk-based prioritization considering data sensitivity and exposure</li>
                    <li>Establish governance processes for maintaining inventory accuracy</li>
                    <li>Create dependency maps showing cryptographic relationships across systems</li>
                    <li>Deploy automated alerting for new quantum-vulnerable implementations</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">5. Systematize Vendor Engagement</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Develop standardized PQC questionnaire for all technology vendors</li>
                    <li>Update procurement templates with PQC requirements and verification</li>
                    <li>Create vendor scorecard to track PQC readiness across ecosystem</li>
                    <li>Engage cloud service providers on PQC roadmaps and enablement options</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">6. Conduct Supply Chain Assessment</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Map complete software and hardware supply chain with dependency analysis</li>
                    <li>Assess all custom-built cryptographic implementations for quantum vulnerabilities</li>
                    <li>Implement third-party risk management program specific to quantum readiness</li>
                    <li>Establish monitoring for supply chain cryptographic changes</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-600 pl-4">
                  <h3 className="text-lg font-bold text-foreground mb-2">7. Strengthen Compliance and Risk Management</h3>
                  <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
                    <li>Integrate quantum risk into enterprise risk management with board reporting</li>
                    <li>Conduct "harvest now, decrypt later" assessment for sensitive long-lived data</li>
                    <li>Establish monitoring for evolving PQC standards and regulatory requirements</li>
                    <li>Align migration timeline to industry-specific compliance mandates</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="text-lg font-bold text-foreground mb-2">Priority Actions (Next 90 Days)</h3>
                <ol className="list-decimal list-inside text-foreground/80 space-y-2 ml-4">
                  <li>Secure executive sponsorship and establish formal PQC steering committee</li>
                  <li>Deploy automated cryptographic discovery tool to begin comprehensive inventory</li>
                  <li>Conduct "harvest now, decrypt later" risk assessment for regulated and sensitive data</li>
                  <li>Initiate vendor engagement program with top 10 critical technology providers</li>
                  <li>Develop detailed migration roadmap with phased approach and resource requirements</li>
                  <li>Establish continuous monitoring for new cryptographic implementations in development</li>
                </ol>
              </div>

              <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-bold text-foreground mb-3">Next Steps: Partner With Us</h3>
                <p className="text-foreground/80 mb-4">
                  Our team of quantum security experts is ready to help you accelerate your PQC journey. We offer:
                </p>
                <ul className="list-disc list-inside text-foreground/80 space-y-2 ml-4 mb-4">
                  <li><strong>Free Pilot Program:</strong> 30-day trial with guided discovery scan of your environment</li>
                  <li><strong>Expert Consultation:</strong> Complimentary roadmap workshop with our PQC specialists</li>
                  <li><strong>Custom Demo:</strong> Personalized demonstration using your organization's use cases</li>
                  <li><strong>ROI Analysis:</strong> Quantified business case showing cost savings and risk reduction</li>
                </ul>
                <p className="text-foreground/80 font-semibold">
                  Contact us to schedule your consultation and begin your quantum-safe transformation today.
                </p>
              </div>
            </div>

            <div className="bg-muted p-6 text-center border-t">
              <p className="text-sm text-muted-foreground mb-2">
                This assessment is based on CISA's "Quantum-Readiness: Migration to Post-Quantum Cryptography" framework
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Report Generated: {new Date().toLocaleString()} | Confidential and Proprietary
              </p>
              <p className="text-xs text-gray-500">
                © 2024 PQC Solutions. All rights reserved.
              </p>
            </div>
          </div>

          <div className="bg-card p-6 text-center border-t no-print">
            <button
              onClick={downloadPDF}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold shadow-lg"
            >
              <Download className="w-5 h-5" />
              Download Report as PDF
            </button>
            <button
              onClick={() => {
                setShowReport(false);
                setCurrentSection(-1);
                setAnswers({});
                setCompanyInfo({ name: '', industry: '', size: '', dataTypes: '' });
              }}
              className="ml-4 inline-flex items-center gap-2 bg-secondary text-secondary-foreground px-6 py-3 rounded-lg hover:bg-secondary/80 transition-colors font-semibold shadow-lg"
            >
              Start New Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Company Info Form
  if (currentSection === -1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-card rounded-lg shadow-2xl p-8">
          <div className="text-center mb-8">
            <Shield className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Post-Quantum Cryptography Readiness Assessment
            </h1>
            <p className="text-muted-foreground">
              Enterprise-Grade Security Evaluation Tool
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-semibold text-foreground/80 mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                value={companyInfo.name}
                onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Industry Sector *
              </label>
              <select
                value={companyInfo.industry}
                onChange={(e) => setCompanyInfo({ ...companyInfo, industry: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select industry</option>
                <option value="Financial Services / Banking">Financial Services / Banking</option>
                <option value="Healthcare / Life Sciences">Healthcare / Life Sciences</option>
                <option value="Government / Defense">Government / Defense</option>
                <option value="Technology / Software">Technology / Software</option>
                <option value="Insurance">Insurance</option>
                <option value="Telecommunications">Telecommunications</option>
                <option value="Energy / Utilities">Energy / Utilities</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Retail / E-commerce">Retail / E-commerce</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Organization Size *
              </label>
              <select
                value={companyInfo.size}
                onChange={(e) => setCompanyInfo({ ...companyInfo, size: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select size</option>
                <option value="500-1,000 employees">500-1,000 employees</option>
                <option value="1,000-5,000 employees">1,000-5,000 employees</option>
                <option value="5,000-10,000 employees">5,000-10,000 employees</option>
                <option value="10,000+ employees">10,000+ employees</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Primary Data Types (Optional)
              </label>
              <textarea
                value={companyInfo.dataTypes}
                onChange={(e) => setCompanyInfo({ ...companyInfo, dataTypes: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., PHI, PII, Financial Records, Intellectual Property"
                rows={2}
              />
            </div>
          </div>

          <button
            onClick={() => setCurrentSection(0)}
            disabled={!companyInfo.name || !companyInfo.industry || !companyInfo.size}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Begin Assessment
            <ChevronRight className="w-5 h-5" />
          </button>

          <p className="text-sm text-gray-500 mt-4 text-center">
            Assessment takes approximately 10-15 minutes to complete
          </p>
        </div>
      </div>
    );
  }

  // Question View
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">PQC Readiness Assessment</h1>
                <p className="text-sm text-muted-foreground">{companyInfo.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Progress</p>
              <p className="text-2xl font-bold text-blue-600">
                {currentSection + 1} / {allQuestions.length}
              </p>
            </div>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold text-blue-600 mb-2">
              {currentQuestion.section}
            </p>
            <h2 className="text-xl font-bold text-foreground mb-6">
              {currentQuestion.question}
            </h2>
          </div>

          <div className="space-y-3">
            {currentQuestion.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(currentQuestion.id, option.value)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  answers[currentQuestion.id] === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                    answers[currentQuestion.id] === option.value
                      ? 'border-primary bg-primary'
                      : 'border-gray-300'
                  }`}>
                    {answers[currentQuestion.id] === option.value && (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                  <span className="text-gray-800">{option.label}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-between mt-8 pt-6 border-t">
            <button
              onClick={() => setCurrentSection(Math.max(-1, currentSection - 1))}
              className="px-6 py-2 text-muted-foreground hover:text-foreground font-semibold"
            >
              ← Previous
            </button>
            
            {currentSection < allQuestions.length - 1 ? (
              <button
                onClick={() => setCurrentSection(currentSection + 1)}
                disabled={answers[currentQuestion.id] === undefined}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Next Question
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={generateReport}
                disabled={answers[currentQuestion.id] === undefined}
                className="px-6 py-2 bg-green-600 text-primary-foreground rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Generate Report
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadinessAnalysis;