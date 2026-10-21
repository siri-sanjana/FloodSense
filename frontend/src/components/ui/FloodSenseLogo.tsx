'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface FloodSenseLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  href?: string;
  className?: string;
  variant?: 'icon' | 'badge' | 'full';
}

export const FloodSenseLogo: React.FC<FloodSenseLogoProps> = ({
  size = 'md',
  showText = true,
  href = '/',
  className = '',
  variant = 'icon',
}) => {
  const sizeMap = {
    sm: { h: 26, w: 45, text: 'text-sm tracking-wider font-extrabold' },
    md: { h: 32, w: 55, text: 'text-base tracking-wide font-extrabold' },
    lg: { h: 44, w: 76, text: 'text-xl tracking-wide font-extrabold' },
    xl: { h: 58, w: 100, text: 'text-2xl tracking-wide font-extrabold' },
  };

  const { h, w, text } = sizeMap[size];

  const content = (
    <div className={`inline-flex items-center space-x-2 select-none ${className}`}>
      {variant === 'full' ? (
        <div
          className="relative shrink-0 flex items-center justify-center"
          style={{ width: `${w * 1.6}px`, height: `${h * 1.4}px` }}
        >
          <Image
            src="/logo-full-trans.png"
            alt="FloodSense Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
      ) : (
        <>
          <div
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: `${w}px`, height: `${h}px` }}
          >
            <Image
              src="/logo-icon.png"
              alt="FloodSense Logo Icon"
              fill
              className="object-contain"
              priority
            />
          </div>

          {showText && (
            <span className={`font-sans text-[#2B5B9E] ${text}`}>
              FLOODSENSE
            </span>
          )}
        </>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
};
