import React from 'react';

/**
 * Official EMDAD Branding Assets
 */
export const EMDAD_LOGO_PATH = '/emdad-logo.png';

export const EMDAD_LOGO_BASE64 =
  'data:image/png;base64,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';

/**
 * Returns HTML <img> tag with Base64 src for print windows & PDF popups
 */
export function getEmdadLogoHtml(height = 36, extraStyle = ''): string {
  return `<img src="${EMDAD_LOGO_BASE64}" alt="EMDAD Logo" style="height: ${height}px; width: auto; object-fit: contain; ${extraStyle}" />`;
}

interface EmdadLogoProps {
  className?: string;
  style?: React.CSSProperties;
  height?: number | string;
  alt?: string;
}

export const EmdadLogo: React.FC<EmdadLogoProps> = ({
  className = 'h-7 w-auto object-contain',
  style,
  height,
  alt = 'EMDAD Logo',
}) => {
  return (
    <img
      src={EMDAD_LOGO_PATH}
      alt={alt}
      className={className}
      style={{ ...(height ? { height } : {}), ...style }}
      onError={(e) => {
        // Fallback to embedded base64 if path load fails
        (e.currentTarget as HTMLImageElement).src = EMDAD_LOGO_BASE64;
      }}
    />
  );
};
