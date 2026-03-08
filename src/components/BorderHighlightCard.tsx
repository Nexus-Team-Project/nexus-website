import { useState, useRef } from 'react';
import type { MouseEvent } from 'react';

interface BorderHighlightCardProps {
  children: React.ReactNode;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}

export default function BorderHighlightCard({ children, className = '', onMouseEnter, onMouseLeave, onClick }: BorderHighlightCardProps) {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });
  };

  const handleMouseEnter = () => {
    onMouseEnter?.();
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    onMouseLeave?.();
  };

  const getBorderStyle = () => {
    if (!mousePos) return {};

    const radius = 120;
    const { x, y } = mousePos;

    return {
      '--mouse-x': `${x}px`,
      '--mouse-y': `${y}px`,
      '--radius': `${radius}px`,
    } as React.CSSProperties;
  };

  return (
    <div
      ref={cardRef}
      className={`${className} relative border-highlight-card`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={getBorderStyle()}
    >
      {children}
    </div>
  );
}
