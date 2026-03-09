import { useRef, useState } from 'react';

interface AnimatedLogoProps {
  staticSrc: string;
  webmSrc: string;
  gifFallbackSrc: string;
  alt: string;
  height: number;
  className?: string;
}

export default function AnimatedLogo({
  staticSrc,
  webmSrc,
  gifFallbackSrc,
  alt,
  height,
  className = '',
}: AnimatedLogoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    setShowVideo(true);

    // Play video on hover
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Fallback if video play fails
        console.warn('Video playback failed');
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);

    // Pause and hide video
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // Hide video after a small delay to avoid flicker
    setTimeout(() => {
      if (!isHovered) {
        setShowVideo(false);
      }
    }, 100);
  };

  return (
    <div
      className={`inline-block cursor-pointer relative ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ height }}
    >
      {/* Static logo - always visible when not hovered */}
      <img
        src={staticSrc}
        alt={alt}
        style={{
          height,
          opacity: showVideo ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out',
        }}
        className="w-auto block absolute top-0 left-0"
      />

      {/* Animated video - shown on hover */}
      {showVideo && (
        <video
          ref={videoRef}
          style={{
            height,
            opacity: showVideo ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}
          className="w-auto block"
          muted
          playsInline
          loop
          preload="none"
        >
          <source src={webmSrc} type="video/webm" />
          {/* Fallback to GIF for browsers that don't support WebM */}
          <img src={gifFallbackSrc} alt={alt} style={{ height }} />
        </video>
      )}
    </div>
  );
}
