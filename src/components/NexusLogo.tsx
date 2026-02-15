import { useState, useRef } from 'react';
import animatedLogoWebM from '../assets/logos/nexus-logo-animated.webm';
import animatedLogoGif from '../assets/logos/nexus-logo-animated.gif';
import animatedLogoBlackWebM from '../assets/logos/nexus-logo-animated-black.webm';
import animatedLogoBlackGif from '../assets/logos/nexus-logo-animated-black.gif';
import staticLogoBlack from '../assets/logos/nexus-logo-black.png';
import whiteWideLogo from '../assets/logos/nexus-white-wide-logo.png';

interface NexusLogoProps {
  className?: string;
  height?: number;
  variant?: 'white' | 'black';
  page?: 'navbar' | 'auth';
}

export default function NexusLogo({ className = '', height = 28, variant = 'white', page }: NexusLogoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // For navbar, use white wide logo; for other pages use regular logos
  const staticSrc = page === 'navbar'
    ? whiteWideLogo
    : variant === 'black'
      ? staticLogoBlack
      : '/nexus-logo.png';

  const animatedWebMSrc = variant === 'black' ? animatedLogoBlackWebM : animatedLogoWebM;
  const animatedGifSrc = variant === 'black' ? animatedLogoBlackGif : animatedLogoGif;

  const handleMouseEnter = () => {
    setIsHovered(true);
    // Play video on hover
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Silently fail if video playback is blocked
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Pause video
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const containerStyles = page === 'navbar'
    ? `inline-block cursor-pointer ${className} font-bold drop-shadow-lg relative`
    : `inline-block cursor-pointer ${className} relative`;

  const imageStyles = page === 'navbar'
    ? "w-auto block brightness-110 contrast-110"
    : "w-auto block";

  return (
    <div
      className={containerStyles}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ height }}
    >
      {/* Static logo - shown when not hovered */}
      <img
        src={staticSrc}
        alt="Nexus"
        style={{
          height,
          opacity: isHovered ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out',
        }}
        className={`${imageStyles} absolute top-0 left-0`}
      />

      {/* Animated video - shown on hover (94% smaller than GIF!) */}
      <video
        ref={videoRef}
        style={{
          height,
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out',
        }}
        className={imageStyles}
        muted
        playsInline
        loop
        preload="none"
      >
        <source src={animatedWebMSrc} type="video/webm" />
        {/* Fallback to GIF for older browsers */}
        <img src={animatedGifSrc} alt="Nexus" style={{ height }} />
      </video>
    </div>
  );
}
