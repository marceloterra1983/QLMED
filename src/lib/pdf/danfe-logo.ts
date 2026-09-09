/**
 * Marca QL MED do cabeçalho Spica — recriação vetorial do carimbo (ql_med).
 * Tinta preta (#000); gaps e L em negativo (transparente). Sem bitmap.
 *
 * A cauda do Q é desenhada após a máscara do L e começa em x≤380 para
 * continuar colada ao disco na base (onde o círculo encurva).
 */
export const DANFE_LOGO_SVG = `<svg class="emit-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 512" width="100%" height="100%" aria-hidden="true">
  <defs>
    <clipPath id="ql-danfe-disc">
      <circle cx="248" cy="256" r="200"/>
    </clipPath>
    <mask id="ql-danfe-cut-l" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="560" height="512" fill="#fff"/>
      <path fill="#000" d="M224 92 h78 v236 h70 v78 H224 Z"/>
    </mask>
  </defs>
  <g clip-path="url(#ql-danfe-disc)" mask="url(#ql-danfe-cut-l)">
    <g fill="#000">
      <rect x="40" y="56" width="416" height="12.5"/>
      <rect x="40" y="81" width="416" height="12.5"/>
      <rect x="40" y="106" width="416" height="12.5"/>
      <rect x="40" y="131" width="416" height="12.5"/>
      <rect x="40" y="156" width="416" height="12.5"/>
      <rect x="40" y="181" width="416" height="12.5"/>
      <rect x="40" y="206" width="416" height="12.5"/>
      <rect x="40" y="231" width="416" height="12.5"/>
    </g>
    <rect x="40" y="256" width="416" height="220" fill="#000"/>
  </g>
  <path fill="#000" d="M370 328 H520 V406 H370 Z"/>
</svg>`;
