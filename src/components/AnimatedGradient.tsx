interface AnimatedGradientProps {
  clipPath?: string;
}

export default function AnimatedGradient({ clipPath = 'polygon(0 0, 100% 0, 100% 65%, 0 100%)' }: AnimatedGradientProps) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ clipPath }}
    >
      {/* Base gradient — balanced warm presence */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#ffb74d] via-[#ff91b8] to-[#9c88ff]" />

      {/* Animated blobs — bigger, faster, more travel distance */}
      <div
        className="absolute w-[150%] h-[150%] -top-[25%] -left-[25%]"
        style={{ filter: 'blur(70px)' }}
      >
        {/* Soft purple/magenta */}
        <div
          className="absolute w-[55%] h-[65%] rounded-full opacity-90"
          style={{
            background: 'radial-gradient(circle, #d881f4 0%, #c068e0 40%, transparent 65%)',
            top: '0%',
            left: '50%',
            animation: 'blob1 10s ease-in-out infinite alternate',
          }}
        />
        {/* Light cyan/turquoise */}
        <div
          className="absolute w-[60%] h-[60%] rounded-full opacity-90"
          style={{
            background: 'radial-gradient(circle, #80deea 0%, #4dd0e1 40%, transparent 65%)',
            top: '20%',
            left: '20%',
            animation: 'blob2 13s ease-in-out infinite alternate',
          }}
        />
        {/* Golden yellow — soft and warm */}
        <div
          className="absolute w-[45%] h-[45%] rounded-full opacity-80"
          style={{
            background: 'radial-gradient(circle, #ffd54f 0%, #ffb74d 35%, transparent 65%)',
            top: '12%',
            left: '-5%',
            animation: 'blob3 12s ease-in-out infinite alternate',
          }}
        />
        {/* Soft pink accent */}
        <div
          className="absolute w-[55%] h-[55%] rounded-full opacity-85"
          style={{
            background: 'radial-gradient(circle, #f48fb1 0%, #ec407a 40%, transparent 65%)',
            top: '30%',
            left: '40%',
            animation: 'blob4 11s ease-in-out infinite alternate',
          }}
        />
        {/* Light lavender */}
        <div
          className="absolute w-[50%] h-[55%] rounded-full opacity-85"
          style={{
            background: 'radial-gradient(circle, #b39ddb 0%, #9575cd 40%, transparent 65%)',
            top: '5%',
            left: '30%',
            animation: 'blob5 14s ease-in-out infinite alternate',
          }}
        />
      </div>

      <style>{`
        @keyframes blob1 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-25%, 20%) scale(1.25); }
          50% { transform: translate(15%, -20%) scale(0.85); }
          75% { transform: translate(-20%, -10%) scale(1.15); }
          100% { transform: translate(20%, 15%) scale(0.9); }
        }
        @keyframes blob2 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(25%, -20%) scale(1.3); }
          50% { transform: translate(-20%, 25%) scale(0.8); }
          75% { transform: translate(15%, 15%) scale(1.2); }
          100% { transform: translate(-25%, -15%) scale(1.1); }
        }
        @keyframes blob3 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-20%, -25%) scale(1.2); }
          50% { transform: translate(25%, 20%) scale(1.3); }
          75% { transform: translate(20%, -15%) scale(0.85); }
          100% { transform: translate(-15%, 25%) scale(1.15); }
        }
        @keyframes blob4 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20%, 20%) scale(0.85); }
          50% { transform: translate(-25%, -15%) scale(1.25); }
          75% { transform: translate(-10%, 25%) scale(1.1); }
          100% { transform: translate(25%, -20%) scale(0.9); }
        }
        @keyframes blob5 {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(25%, 10%) scale(1.2); }
          50% { transform: translate(-15%, -25%) scale(1.15); }
          75% { transform: translate(20%, 20%) scale(0.85); }
          100% { transform: translate(-20%, 15%) scale(1.3); }
        }
      `}</style>
    </div>
  );
}
