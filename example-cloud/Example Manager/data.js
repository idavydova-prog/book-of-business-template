const dashboardConfig = {
    asOf: '2026-06-25',
    fqStart: '2026-05-01',
    fqEnd: '2026-07-31'
};

const slackDMs = {
    "Alice Johnson": "D00EXAMPLE1",
    "Bob Smith": "D00EXAMPLE2",
    "Carol Williams": "D00EXAMPLE3"
};

const csmOrder = ["Alice Johnson", "Bob Smith", "Carol Williams"];

const accounts = [
    {
        name: "Acme Corporation",
        csm: "Alice Johnson",
        priorAcv: 2500000,
        health: "Strong",
        ra: [],
        products: ["Commerce Cloud", "Order Management"],
        hasCC: true,
        link: "https://org62.lightning.force.com/lightning/r/Opportunity/006EXAMPLE01/view",
        renewalDate: "2027-03-15",
        renewalAmount: 0,
        renewalAmountDisplay: "$0",
        compliance: "pass",
        complianceReason: "#LicNoAttrit and #NoSigRisk present",
        csgNotes: "6/20/26 Alice Johnson #LicNoAttrit #NoSigRisk Strong engagement, healthy adoption metrics across all product lines",
        csgNotesDate: "2026-06-20",
        gmv: { allowance: 500000000, contractStart: "2025-03-15", used: 85000000, pct: 17, entitlement: "Commerce Cloud B2C - GMV", contractEnd: "2027-03-15" },
        group: null, groupRole: null,
        ari: null
    },
    {
        name: "Global Retail Inc",
        csm: "Alice Johnson",
        priorAcv: 1800000,
        health: "Moderate",
        ra: [
            { id: "a4VEXAMPLE01", headline: "#ADOPT Low utilization and engagement decline", status: "active", lastModified: "2026-06-18", raCompliance: "pass", raReason: "#ADOPT is a valid play hashtag" }
        ],
        products: ["Commerce Cloud", "Core"],
        hasCC: true,
        link: "https://org62.lightning.force.com/lightning/r/Opportunity/006EXAMPLE02/view",
        renewalDate: "2026-09-30",
        renewalAmount: -250000,
        renewalAmountDisplay: "-$250K",
        compliance: "pass",
        complianceReason: "#LicPartialAttrit, #SigRisk, and #RA present",
        csgNotes: "6/15/26 Alice Johnson #LicPartialAttrit #SigRisk #RA sfdc.co/abc123 Adoption challenges, working on engagement plan with exec sponsor",
        csgNotesDate: "2026-06-15",
        gmv: { allowance: 300000000, contractStart: "2024-10-01", used: 195000000, pct: 65, entitlement: "Commerce Cloud B2C - GMV", contractEnd: "2026-09-30" },
        group: null, groupRole: null,
        ari: null
    },
    {
        name: "TechStart Solutions",
        csm: "Bob Smith",
        priorAcv: 450000,
        health: "Strong",
        ra: [],
        products: ["Commerce Cloud"],
        hasCC: true,
        link: "https://org62.lightning.force.com/lightning/r/Opportunity/006EXAMPLE03/view",
        renewalDate: "2027-11-01",
        renewalAmount: 0,
        renewalAmountDisplay: "$0",
        compliance: "pass",
        complianceReason: "#LicNoAttrit present",
        csgNotes: "6/22/26 Bob Smith #LicNoAttrit Healthy account, on track for growth at renewal",
        csgNotesDate: "2026-06-22",
        gmv: { allowance: 100000000, contractStart: "2025-11-01", used: 12000000, pct: 12, entitlement: "Commerce Cloud B2C - GMV", contractEnd: "2027-11-01" },
        group: null, groupRole: null,
        ari: null
    },
    {
        name: "Midwest Manufacturing",
        csm: "Bob Smith",
        priorAcv: 920000,
        health: "Declining",
        ra: [
            { id: "a4VEXAMPLE02", headline: "#RFP Competitive evaluation in progress", status: "active", lastModified: "2026-06-10", raCompliance: "pass", raReason: "#RFP is a valid play hashtag" }
        ],
        products: ["Commerce Cloud", "B2B Commerce", "Integration Cloud"],
        hasCC: true,
        link: "https://org62.lightning.force.com/lightning/r/Opportunity/006EXAMPLE04/view",
        renewalDate: "2026-07-15",
        renewalAmount: -920000,
        renewalAmountDisplay: "-$920K",
        compliance: "fail",
        complianceReason: "Missing #RA in CSG Notes",
        csgNotes: "5/28/26 Bob Smith #LicFullAttrit #SigAttrit Competitive RFP in progress, customer evaluating alternatives",
        csgNotesDate: "2026-05-28",
        gmv: { allowance: 200000000, contractStart: "2024-07-15", used: 48000000, pct: 24, entitlement: "Commerce Cloud B2C - GMV", contractEnd: "2026-07-15" },
        group: null, groupRole: null,
        ari: null
    },
    {
        name: "Sunrise Health",
        csm: "Carol Williams",
        priorAcv: 650000,
        health: "Strong",
        ra: [],
        products: ["Commerce Cloud", "Service Cloud"],
        hasCC: true,
        link: "https://org62.lightning.force.com/lightning/r/Opportunity/006EXAMPLE05/view",
        renewalDate: "2028-01-20",
        renewalAmount: 0,
        renewalAmountDisplay: "$0",
        compliance: "pass",
        complianceReason: "#LicNoAttrit and #NoSigRisk present",
        csgNotes: "6/24/26 Carol Williams #LicNoAttrit #NoSigRisk Excellent partnership, expanding use cases into mobile commerce",
        csgNotesDate: "2026-06-24",
        gmv: { allowance: 150000000, contractStart: "2026-01-20", used: 18000000, pct: 12, entitlement: "Commerce Cloud B2C - GMV", contractEnd: "2028-01-20" },
        group: null, groupRole: null,
        ari: null
    }
];
