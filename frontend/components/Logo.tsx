/**
 * Verifund Logo Component
 *
 * Variants:
 * - "full": Logo Mark + Wordmark
 * - "mark": Logo Mark only
 * - "wordmark": Wordmark only
 */

import React from 'react';
import Image from 'next/image';

export type LogoVariant = 'full' | 'mark' | 'wordmark';
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';
export type LogoTheme = 'light' | 'dark';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  theme?: LogoTheme;
  className?: string;
}

const sizeMap = {
  sm: { width: 64, height: 64, text: 'text-2xl' },
  md: { width: 100, height: 100, text: 'text-3xl' },
  lg: { width: 128, height: 128, text: 'text-4xl' },
  xl: { width: 160, height: 160, text: 'text-5xl' },
};

export function Logo({
  variant = 'full',
  size = 'md',
  theme = 'dark',
  className = '',
}: LogoProps) {
  const colorClass = theme === 'dark' ? 'text-foreground' : 'text-background';
  const { width, height, text: textSize } = sizeMap[size];

  // Verifond Mark (Loaded from public/verifundlogo.svg)
  const StrongMark = () => (
    <Image 
      src="/verifundlogo.svg" 
      alt="Verifond Logo" 
      width={width} 
      height={height}
      className={`object-contain ${className}`}
    />
  );

  // Wordmark
  const Wordmark = () => (
    <span
      className={`${textSize} font-bold ${colorClass} font-[family-name:var(--font-display)] transition-colors tracking-tight`}
    >
      Verifond
    </span>
  );

  if (variant === 'mark') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <StrongMark />
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <Wordmark />
      </div>
    );
  }

  // Full logo (default): Strong Mark + Wordmark
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <StrongMark />
      <Wordmark />
    </div>
  );
}

// Convenience components for common use cases
export function LogoFull(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="full" />;
}

export function LogoMark(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="mark" />;
}

export function LogoWordmark(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="wordmark" />;
}
