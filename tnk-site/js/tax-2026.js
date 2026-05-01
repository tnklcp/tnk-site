/* TNK Lawncare 2026 tax calculator
 * Federal data: 2026 inflation-adjusted figures (IRS Rev. Proc. 2025-32),
 * FICA: 2026 SS wage base $184,500; SS 6.2%, Medicare 1.45%, Add'l Medicare 0.9%.
 * State data: 2026 published rate schedules where known; flat-rate states use
 * their 2026 statutory rate; states without a wage income tax are zeroed out.
 * Estimates only — payroll software remains the source of truth.
 */
(function () {
  const TAX_2026 = {
    federalBrackets: {
      single: [
        { upTo: 12400, rate: 0.10 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 }
      ],
      mfj: [
        { upTo: 24800, rate: 0.10 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 }
      ],
      mfs: [
        { upTo: 12400, rate: 0.10 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 384350, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 }
      ],
      hoh: [
        { upTo: 17700, rate: 0.10 },
        { upTo: 67450, rate: 0.12 },
        { upTo: 108725, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256200, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 }
      ]
    },
    standardDeduction: {
      single: 16100,
      mfj: 32200,
      mfs: 16100,
      hoh: 24150
    },
    socialSecurity: { rate: 0.062, wageBase: 184500 },
    medicare: { rate: 0.0145 },
    additionalMedicare: {
      rate: 0.009,
      threshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 }
    },
    childTaxCredit: 2000
  };

  const FILING_STATUSES = [
    { value: "single", label: "Single" },
    { value: "mfj", label: "Married, filing jointly" },
    { value: "mfs", label: "Married, filing separately" },
    { value: "hoh", label: "Head of household" }
  ];

  // State income tax — 2026 estimates. Brackets are simplified (single/joint).
  // States with no wage income tax are present with zero rate so the UI is consistent.
  const STATE_TAX = {
    AL: { name: "Alabama", brackets: { single: [
      { upTo: 500, rate: 0.02 }, { upTo: 3000, rate: 0.04 }, { upTo: Infinity, rate: 0.05 }
    ], mfj: [{ upTo: 1000, rate: 0.02 }, { upTo: 6000, rate: 0.04 }, { upTo: Infinity, rate: 0.05 }] }, deduction: { single: 3000, mfj: 8500 } },
    AK: { name: "Alaska", flat: 0 },
    AZ: { name: "Arizona", flat: 0.025 },
    AR: { name: "Arkansas", brackets: { single: [
      { upTo: 5300, rate: 0.02 }, { upTo: 10600, rate: 0.03 }, { upTo: Infinity, rate: 0.039 }
    ] }, deduction: { single: 2410, mfj: 4820 } },
    CA: { name: "California", brackets: { single: [
      { upTo: 11000, rate: 0.01 }, { upTo: 26100, rate: 0.02 }, { upTo: 41200, rate: 0.04 },
      { upTo: 57200, rate: 0.06 }, { upTo: 72300, rate: 0.08 }, { upTo: 369000, rate: 0.093 },
      { upTo: 442700, rate: 0.103 }, { upTo: 738000, rate: 0.113 }, { upTo: Infinity, rate: 0.123 }
    ], mfj: [
      { upTo: 22000, rate: 0.01 }, { upTo: 52200, rate: 0.02 }, { upTo: 82400, rate: 0.04 },
      { upTo: 114400, rate: 0.06 }, { upTo: 144600, rate: 0.08 }, { upTo: 738000, rate: 0.093 },
      { upTo: 885400, rate: 0.103 }, { upTo: 1476000, rate: 0.113 }, { upTo: Infinity, rate: 0.123 }
    ] }, deduction: { single: 5540, mfj: 11080 } },
    CO: { name: "Colorado", flat: 0.044 },
    CT: { name: "Connecticut", brackets: { single: [
      { upTo: 10000, rate: 0.02 }, { upTo: 50000, rate: 0.045 }, { upTo: 100000, rate: 0.055 },
      { upTo: 200000, rate: 0.06 }, { upTo: 250000, rate: 0.065 }, { upTo: 500000, rate: 0.069 },
      { upTo: Infinity, rate: 0.0699 }
    ] } },
    DE: { name: "Delaware", brackets: { single: [
      { upTo: 2000, rate: 0 }, { upTo: 5000, rate: 0.022 }, { upTo: 10000, rate: 0.039 },
      { upTo: 20000, rate: 0.048 }, { upTo: 25000, rate: 0.052 }, { upTo: 60000, rate: 0.0555 },
      { upTo: Infinity, rate: 0.066 }
    ] }, deduction: { single: 3250, mfj: 6500 } },
    DC: { name: "District of Columbia", brackets: { single: [
      { upTo: 10000, rate: 0.04 }, { upTo: 40000, rate: 0.06 }, { upTo: 60000, rate: 0.065 },
      { upTo: 250000, rate: 0.085 }, { upTo: 500000, rate: 0.0925 }, { upTo: 1000000, rate: 0.0975 },
      { upTo: Infinity, rate: 0.1075 }
    ] } },
    FL: { name: "Florida", flat: 0 },
    GA: { name: "Georgia", flat: 0.0539 },
    HI: { name: "Hawaii", brackets: { single: [
      { upTo: 2400, rate: 0.014 }, { upTo: 4800, rate: 0.032 }, { upTo: 9600, rate: 0.055 },
      { upTo: 14400, rate: 0.064 }, { upTo: 19200, rate: 0.068 }, { upTo: 24000, rate: 0.072 },
      { upTo: 36000, rate: 0.076 }, { upTo: 48000, rate: 0.079 }, { upTo: 150000, rate: 0.0825 },
      { upTo: 175000, rate: 0.09 }, { upTo: 200000, rate: 0.10 }, { upTo: Infinity, rate: 0.11 }
    ] } },
    ID: { name: "Idaho", flat: 0.053 },
    IL: { name: "Illinois", flat: 0.0495 },
    IN: { name: "Indiana", flat: 0.029 },
    IA: { name: "Iowa", flat: 0.038 },
    KS: { name: "Kansas", brackets: { single: [
      { upTo: 23000, rate: 0.054 }, { upTo: Infinity, rate: 0.0558 }
    ] } },
    KY: { name: "Kentucky", flat: 0.035 },
    LA: { name: "Louisiana", flat: 0.03 },
    ME: { name: "Maine", brackets: { single: [
      { upTo: 26800, rate: 0.058 }, { upTo: 63450, rate: 0.0675 }, { upTo: Infinity, rate: 0.0715 }
    ] }, deduction: { single: 14600, mfj: 29200 } },
    MD: { name: "Maryland", brackets: { single: [
      { upTo: 1000, rate: 0.02 }, { upTo: 2000, rate: 0.03 }, { upTo: 3000, rate: 0.04 },
      { upTo: 100000, rate: 0.0475 }, { upTo: 125000, rate: 0.05 }, { upTo: 150000, rate: 0.0525 },
      { upTo: 250000, rate: 0.055 }, { upTo: Infinity, rate: 0.0575 }
    ] } },
    MA: { name: "Massachusetts", flat: 0.05, surchargeOver1m: 0.04 },
    MI: { name: "Michigan", flat: 0.0425 },
    MN: { name: "Minnesota", brackets: { single: [
      { upTo: 32570, rate: 0.0535 }, { upTo: 106990, rate: 0.068 }, { upTo: 198630, rate: 0.0785 },
      { upTo: Infinity, rate: 0.0985 }
    ] }, deduction: { single: 14575, mfj: 29150 } },
    MS: { name: "Mississippi", flat: 0.044 },
    MO: { name: "Missouri", brackets: { single: [
      { upTo: 1273, rate: 0 }, { upTo: 2546, rate: 0.02 }, { upTo: 3819, rate: 0.025 },
      { upTo: 5092, rate: 0.03 }, { upTo: 6365, rate: 0.035 }, { upTo: 7638, rate: 0.04 },
      { upTo: 8911, rate: 0.045 }, { upTo: Infinity, rate: 0.047 }
    ] } },
    MT: { name: "Montana", brackets: { single: [
      { upTo: 21100, rate: 0.047 }, { upTo: Infinity, rate: 0.059 }
    ] }, deduction: { single: 14575, mfj: 29150 } },
    NE: { name: "Nebraska", brackets: { single: [
      { upTo: 4030, rate: 0.0246 }, { upTo: 24120, rate: 0.0351 }, { upTo: 38870, rate: 0.0501 },
      { upTo: Infinity, rate: 0.052 }
    ] } },
    NV: { name: "Nevada", flat: 0 },
    NH: { name: "New Hampshire", flat: 0 },
    NJ: { name: "New Jersey", brackets: { single: [
      { upTo: 20000, rate: 0.014 }, { upTo: 35000, rate: 0.0175 }, { upTo: 40000, rate: 0.035 },
      { upTo: 75000, rate: 0.05525 }, { upTo: 500000, rate: 0.0637 }, { upTo: 1000000, rate: 0.0897 },
      { upTo: Infinity, rate: 0.1075 }
    ] } },
    NM: { name: "New Mexico", brackets: { single: [
      { upTo: 5500, rate: 0.017 }, { upTo: 11000, rate: 0.032 }, { upTo: 16000, rate: 0.047 },
      { upTo: 210000, rate: 0.049 }, { upTo: Infinity, rate: 0.059 }
    ] } },
    NY: { name: "New York", brackets: { single: [
      { upTo: 8500, rate: 0.04 }, { upTo: 11700, rate: 0.045 }, { upTo: 13900, rate: 0.0525 },
      { upTo: 80650, rate: 0.055 }, { upTo: 215400, rate: 0.06 }, { upTo: 1077550, rate: 0.0685 },
      { upTo: 5000000, rate: 0.0965 }, { upTo: 25000000, rate: 0.103 }, { upTo: Infinity, rate: 0.109 }
    ] }, deduction: { single: 8000, mfj: 16050 } },
    NC: { name: "North Carolina", flat: 0.0425 },
    ND: { name: "North Dakota", brackets: { single: [
      { upTo: 47150, rate: 0 }, { upTo: 238200, rate: 0.0195 }, { upTo: Infinity, rate: 0.025 }
    ] } },
    OH: { name: "Ohio", brackets: { single: [
      { upTo: 26050, rate: 0 }, { upTo: 100000, rate: 0.0275 }, { upTo: Infinity, rate: 0.035 }
    ] } },
    OK: { name: "Oklahoma", brackets: { single: [
      { upTo: 1000, rate: 0.0025 }, { upTo: 2500, rate: 0.0075 }, { upTo: 3750, rate: 0.0175 },
      { upTo: 4900, rate: 0.0275 }, { upTo: 7200, rate: 0.0375 }, { upTo: Infinity, rate: 0.0475 }
    ] } },
    OR: { name: "Oregon", brackets: { single: [
      { upTo: 4400, rate: 0.0475 }, { upTo: 11050, rate: 0.0675 }, { upTo: 125000, rate: 0.0875 },
      { upTo: Infinity, rate: 0.099 }
    ], mfj: [
      { upTo: 8800, rate: 0.0475 }, { upTo: 22100, rate: 0.0675 }, { upTo: 250000, rate: 0.0875 },
      { upTo: Infinity, rate: 0.099 }
    ] }, deduction: { single: 2745, mfj: 5495 } },
    PA: { name: "Pennsylvania", flat: 0.0307 },
    RI: { name: "Rhode Island", brackets: { single: [
      { upTo: 79900, rate: 0.0375 }, { upTo: 181650, rate: 0.0475 }, { upTo: Infinity, rate: 0.0599 }
    ] } },
    SC: { name: "South Carolina", brackets: { single: [
      { upTo: 3460, rate: 0 }, { upTo: 17330, rate: 0.03 }, { upTo: Infinity, rate: 0.062 }
    ] } },
    SD: { name: "South Dakota", flat: 0 },
    TN: { name: "Tennessee", flat: 0 },
    TX: { name: "Texas", flat: 0 },
    UT: { name: "Utah", flat: 0.0455 },
    VT: { name: "Vermont", brackets: { single: [
      { upTo: 47900, rate: 0.0335 }, { upTo: 116000, rate: 0.066 }, { upTo: 242000, rate: 0.076 },
      { upTo: Infinity, rate: 0.0875 }
    ] } },
    VA: { name: "Virginia", brackets: { single: [
      { upTo: 3000, rate: 0.02 }, { upTo: 5000, rate: 0.03 }, { upTo: 17000, rate: 0.05 },
      { upTo: Infinity, rate: 0.0575 }
    ] } },
    WA: { name: "Washington", flat: 0 },
    WV: { name: "West Virginia", brackets: { single: [
      { upTo: 10000, rate: 0.0236 }, { upTo: 25000, rate: 0.0315 }, { upTo: 40000, rate: 0.0354 },
      { upTo: 60000, rate: 0.0472 }, { upTo: Infinity, rate: 0.0512 }
    ] } },
    WI: { name: "Wisconsin", brackets: { single: [
      { upTo: 14320, rate: 0.0354 }, { upTo: 28640, rate: 0.044 }, { upTo: 315310, rate: 0.053 },
      { upTo: Infinity, rate: 0.0765 }
    ] } },
    WY: { name: "Wyoming", flat: 0 }
  };

  const computeProgressive = (taxable, brackets) => {
    let tax = 0;
    let prev = 0;
    for (const bracket of brackets) {
      if (taxable <= prev) break;
      const slice = Math.min(taxable, bracket.upTo) - prev;
      if (slice > 0) tax += slice * bracket.rate;
      prev = bracket.upTo;
      if (taxable <= prev) break;
    }
    return Math.max(0, tax);
  };

  const getBracketsFor = (state, filingStatus) => {
    if (!state || !state.brackets) return null;
    return state.brackets[filingStatus] || state.brackets.single || null;
  };

  const calcStateTax = (annualIncome, stateCode, filingStatus) => {
    const state = STATE_TAX[stateCode];
    if (!state) return { stateTax: 0, stateName: "", note: "Unknown state — no withholding applied." };
    if (typeof state.flat === "number") {
      const baseTax = Math.max(0, annualIncome) * state.flat;
      const surcharge = state.surchargeOver1m && annualIncome > 1000000
        ? (annualIncome - 1000000) * state.surchargeOver1m
        : 0;
      return { stateTax: baseTax + surcharge, stateName: state.name, note: state.flat ? "" : "No state wage income tax." };
    }
    const brackets = getBracketsFor(state, filingStatus);
    if (!brackets) return { stateTax: 0, stateName: state.name, note: "Brackets unavailable." };
    const deduction = state.deduction
      ? state.deduction[filingStatus] ?? state.deduction.single ?? 0
      : 0;
    const taxable = Math.max(0, annualIncome - deduction);
    return { stateTax: computeProgressive(taxable, brackets), stateName: state.name, note: "" };
  };

  const calcFederalIncomeTax = (annualIncome, filingStatus, dependents) => {
    const fs = filingStatus in TAX_2026.federalBrackets ? filingStatus : "single";
    const standard = TAX_2026.standardDeduction[fs];
    const taxable = Math.max(0, annualIncome - standard);
    const rawTax = computeProgressive(taxable, TAX_2026.federalBrackets[fs]);
    const credit = Math.max(0, Number(dependents) || 0) * TAX_2026.childTaxCredit;
    return Math.max(0, rawTax - credit);
  };

  const calcFICA = (annualIncome, filingStatus) => {
    const ss = Math.min(Math.max(0, annualIncome), TAX_2026.socialSecurity.wageBase) * TAX_2026.socialSecurity.rate;
    const medicareBase = Math.max(0, annualIncome) * TAX_2026.medicare.rate;
    const fs = filingStatus in TAX_2026.additionalMedicare.threshold ? filingStatus : "single";
    const addThreshold = TAX_2026.additionalMedicare.threshold[fs];
    const addMed = Math.max(0, annualIncome - addThreshold) * TAX_2026.additionalMedicare.rate;
    return { socialSecurity: ss, medicare: medicareBase + addMed };
  };

  /**
   * Calculate annualized + per-paycheck tax breakdown.
   * @param {Object} input
   *   annualGross: annual wages (gross) including this job
   *   filingStatus: "single" | "mfj" | "mfs" | "hoh"
   *   state: 2-letter state code
   *   dependents: number of qualifying children for CTC
   *   additionalWithholding: extra federal withholding per check
   *   preTaxDeductionsPerCheck: pre-tax deductions per paycheck (reduce taxable wages)
   *   periodGross: gross for the current pay period (used to scale withholding)
   *   periodsPerYear: pay periods per year (default 26 = biweekly)
   *   annualOtherIncome: additional household income for joint estimation
   */
  const calculate = (input) => {
    const periodsPerYear = Number(input.periodsPerYear) || 26;
    const filingStatus = input.filingStatus || "single";
    const dependents = Number(input.dependents) || 0;
    const preTaxPerCheck = Number(input.preTaxDeductionsPerCheck) || 0;
    const additionalWithholding = Number(input.additionalWithholding) || 0;
    const annualOther = Number(input.annualOtherIncome) || 0;

    const annualGross = Math.max(0, Number(input.annualGross) || 0);
    const annualPreTax = preTaxPerCheck * periodsPerYear;
    const annualTaxableWages = Math.max(0, annualGross - annualPreTax);
    const householdTaxable = annualTaxableWages + annualOther;

    const federalIncomeTax = calcFederalIncomeTax(householdTaxable, filingStatus, dependents);
    // Allocate household federal tax to this employee proportional to their wages.
    const employeeShare = householdTaxable > 0 ? annualTaxableWages / householdTaxable : 1;
    const employeeFederal = federalIncomeTax * employeeShare + additionalWithholding * periodsPerYear;

    const fica = calcFICA(annualGross, filingStatus);

    const stateResult = calcStateTax(annualTaxableWages, input.state || "", filingStatus);

    const annualNet = annualGross - employeeFederal - fica.socialSecurity - fica.medicare - stateResult.stateTax - annualPreTax;

    const periodGross = Number(input.periodGross);
    const useScaled = Number.isFinite(periodGross);
    const totalAnnualTax = employeeFederal + fica.socialSecurity + fica.medicare + stateResult.stateTax;
    const effectiveRate = annualGross > 0 ? totalAnnualTax / annualGross : 0;

    const periodFederal = useScaled ? (employeeFederal / periodsPerYear) : 0;
    const periodSS = useScaled ? (fica.socialSecurity / periodsPerYear) : 0;
    const periodMedicare = useScaled ? (fica.medicare / periodsPerYear) : 0;
    const periodState = useScaled ? (stateResult.stateTax / periodsPerYear) : 0;
    const periodTotalTax = useScaled
      ? (periodGross * effectiveRate)
      : 0;
    const periodNet = useScaled ? Math.max(0, periodGross - periodTotalTax - preTaxPerCheck) : 0;

    return {
      annual: {
        gross: annualGross,
        preTax: annualPreTax,
        taxableWages: annualTaxableWages,
        federal: employeeFederal,
        socialSecurity: fica.socialSecurity,
        medicare: fica.medicare,
        state: stateResult.stateTax,
        stateName: stateResult.stateName,
        stateNote: stateResult.note,
        totalTax: totalAnnualTax,
        net: Math.max(0, annualNet)
      },
      perPaycheck: useScaled
        ? {
            gross: periodGross,
            preTax: preTaxPerCheck,
            federal: periodFederal,
            socialSecurity: periodSS,
            medicare: periodMedicare,
            state: periodState,
            totalTax: periodTotalTax,
            net: periodNet
          }
        : null,
      effectiveRate
    };
  };

  const stateOptions = () =>
    Object.entries(STATE_TAX)
      .map(([code, data]) => ({ code, name: data.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

  window.tnkTax2026 = {
    calculate,
    stateOptions,
    filingStatuses: FILING_STATUSES,
    constants: TAX_2026
  };
})();
