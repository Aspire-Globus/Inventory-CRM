// Aspire System Management branding for the Swagger API docs page (/api/docs)

const BOX = `<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>`;

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 40 40">
<rect width="40" height="40" rx="8" fill="#5EC2B1"/>
<g transform="translate(9.5 9.5) scale(0.875)" fill="none" stroke="#14302C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BOX}</g>
<circle cx="33" cy="7" r="1.6" fill="#14302C"/>
</svg>`;

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40" viewBox="0 0 240 40">
<rect width="40" height="40" rx="8" fill="#5EC2B1"/>
<g transform="translate(9.5 9.5) scale(0.875)" fill="none" stroke="#14302C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BOX}</g>
<circle cx="33" cy="7" r="1.6" fill="#14302C"/>
<text x="52" y="18" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700" fill="#FFFFFF">Aspire</text>
<text x="52" y="34" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#A8C2BC">System Management</text>
</svg>`;

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export const swaggerCss = `
  .swagger-ui .topbar { background: #14302C; padding: 12px 0; }
  .swagger-ui .topbar .topbar-wrapper a { display: block; width: 240px; height: 40px; max-width: none;
    background: url("${dataUri(LOGO_SVG)}") no-repeat left center / contain; }
  .swagger-ui .topbar .topbar-wrapper a > * { display: none !important; }
  .swagger-ui .info .title { color: #14302C; }
  .swagger-ui .btn.authorize { color: #0F766E; border-color: #0F766E; }
  .swagger-ui .btn.authorize svg { fill: #0F766E; }
`;