import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'table';
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
  rows?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  width = '100%',
  height,
  borderRadius,
  style,
  rows = 4,
}) => {
  if (variant === 'table') {
    return (
      <div style={{ width: '100%', overflow: 'hidden', ...style }}>
        <div
          className="skeleton-pulse"
          style={{
            height: '42px',
            width: '100%',
            backgroundColor: '#F1F5F9',
            borderRadius: '8px 8px 0 0',
            marginBottom: '4px',
          }}
        />
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="skeleton-pulse"
            style={{
              height: '48px',
              width: '100%',
              backgroundColor: i % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
              borderBottom: '1px solid #E2E8F0',
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className="skeleton-pulse"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid #E2E8F0',
          height: height || '120px',
          ...style,
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              backgroundColor: '#E2E8F0',
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: '14px',
                width: '40%',
                backgroundColor: '#E2E8F0',
                borderRadius: '4px',
                marginBottom: '8px',
              }}
            />
            <div
              style={{
                height: '24px',
                width: '60%',
                backgroundColor: '#CBD5E1',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const getDefaultHeight = () => {
    switch (variant) {
      case 'circular': return width;
      case 'text': return '1rem';
      default: return height || '100px';
    }
  };

  const getBorderRadius = () => {
    if (borderRadius) return borderRadius;
    switch (variant) {
      case 'circular': return '50%';
      case 'text': return '4px';
      default: return '8px';
    }
  };

  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height: height || getDefaultHeight(),
        borderRadius: getBorderRadius(),
        backgroundColor: '#E2E8F0',
        ...style,
      }}
    />
  );
};
