/**
 * Marca QL MED do cabeçalho Spica — recriação vetorial do carimbo (ql_med).
 * Tinta preta (#000); gaps e L em negativo (transparente). Sem bitmap.
 *
 * Proporções alinhadas ao carimbo: listras densas no topo, sólido sobreposto
 * na última listra (sem fio branco no equador), L alto com pé longo,
 * cauda do Q curta encostada no pé.
 */
export const DANFE_LOGO_SVG = `<svg class="emit-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 512" width="100%" height="100%" aria-hidden="true">
  <defs>
    <clipPath id="ql-danfe-disc">
      <circle cx="248" cy="256" r="200"/>
    </clipPath>
    <mask id="ql-danfe-cut-l" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="560" height="512" fill="#fff"/>
      <path fill="#000" d="M218 72 h84 v240 h110 v68 H218 Z"/>
    </mask>
  </defs>
  <g clip-path="url(#ql-danfe-disc)" mask="url(#ql-danfe-cut-l)">
    <g fill="#000">
      <rect x="40" y="56" width="416" height="11"/>
      <rect x="40" y="78" width="416" height="11"/>
      <rect x="40" y="100" width="416" height="11"/>
      <rect x="40" y="122" width="416" height="11"/>
      <rect x="40" y="144" width="416" height="11"/>
      <rect x="40" y="166" width="416" height="11"/>
      <rect x="40" y="188" width="416" height="11"/>
      <rect x="40" y="210" width="416" height="11"/>
      <rect x="40" y="232" width="416" height="11"/>
    </g>
    <rect x="40" y="241" width="416" height="235" fill="#000"/>
  </g>
  <path fill="#000" d="M392 312 H518 V380 H392 Z"/>
</svg>`;
