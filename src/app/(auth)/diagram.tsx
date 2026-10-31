/**
 * Static product diagram: what a company puts in (plans, customers, taxes and
 * discounts) converging on Brightloop, and what comes out (invoices, payments, reports).
 */
const inputs = ["Products & plans", "Customers", "Taxes & discounts"];
const outputs = ["Invoices", "Payments", "Reports"];
const rowY = [40, 120, 200];

export function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 480 240"
      role="img"
      aria-label="Products and plans, customers, and taxes and discounts flow into Brightloop, which produces invoices, payments and reports."
      className="h-auto w-full max-w-[480px]"
    >
      <defs>
        <linearGradient id="core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a74f0" />
          <stop offset="1" stopColor="#074ce0" />
        </linearGradient>
      </defs>
      {/* Orbit lines around the core */}
      <circle cx="240" cy="120" r="74" fill="none" stroke="#d0d4dd" strokeOpacity="0.18" />
      <circle cx="240" cy="120" r="96" fill="none" stroke="#d0d4dd" strokeOpacity="0.1" />
      {/* Connectors */}
      {rowY.map((y) => (
        <g key={y} stroke="#d0d4dd" strokeOpacity="0.45" fill="none">
          <path d={`M132 ${y} C 180 ${y}, 180 120, 200 120`} />
          <path d={`M280 120 C 300 120, 300 ${y}, 348 ${y}`} />
        </g>
      ))}
      {/* Core */}
      <rect x="200" y="80" width="80" height="80" rx="18" fill="url(#core)" />
      <rect x="200.5" y="80.5" width="79" height="79" rx="17.5" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
      <path d="M226 120a14 14 0 1 0 14-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M254 120a14 14 0 1 0-14 14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.7" />
      {/* Tiles */}
      {inputs.map((label, i) => (
        <g key={label}>
          <rect x="4" y={rowY[i] - 17} width="128" height="34" rx="8" fill="#fff" />
          <text x="68" y={rowY[i] + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="500" fill="#16191f">
            {label}
          </text>
        </g>
      ))}
      {outputs.map((label, i) => (
        <g key={label}>
          <rect x="348" y={rowY[i] - 17} width="128" height="34" rx="8" fill="#fff" />
          <circle cx="366" cy={rowY[i]} r="4" fill="#074ce0" />
          <text x="380" y={rowY[i] + 4.5} fontSize="12.5" fontWeight="500" fill="#16191f">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
