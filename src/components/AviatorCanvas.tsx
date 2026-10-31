import React, { useRef, useEffect, useState } from 'react';
import { GameRound } from '../types';

interface AviatorCanvasProps {
  currentRound: GameRound;
  multiplier: number;
  countdown: number;
}

export const AviatorCanvas: React.FC<AviatorCanvasProps> = ({
  currentRound,
  multiplier,
  countdown,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(220);

  const stateRef = useRef({
    currentRound,
    multiplier,
    countdown,
  });

  useEffect(() => {
    stateRef.current = { currentRound, multiplier, countdown };
  }, [currentRound, multiplier, countdown]);

  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineCount((prev) => {
        const delta = Math.floor(Math.random() * 5) - 2;
        return Math.max(185, Math.min(295, prev + delta));
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rayAngleOffset = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const drawRedAviatorPlane = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      angleRad: number,
      timeMs: number
    ) => {
      c.save();
      c.translate(x, y);
      c.rotate(angleRad);

      // Glow behind aircraft
      c.shadowColor = 'rgba(239, 35, 60, 0.7)';
      c.shadowBlur = 14;

      // Main fuselage
      c.fillStyle = '#e11d48';
      c.beginPath();
      c.moveTo(22, 0); // Nose
      c.quadraticCurveTo(12, -7, -6, -5);
      c.lineTo(-22, -13); // Tail top
      c.lineTo(-26, -12);
      c.lineTo(-19, -2);
      c.lineTo(-24, 2);
      c.lineTo(6, 5);
      c.quadraticCurveTo(16, 4, 22, 0);
      c.closePath();
      c.fill();

      // Swept main wing
      c.fillStyle = '#ff1e42';
      c.beginPath();
      c.moveTo(5, 1);
      c.lineTo(-10, 13);
      c.lineTo(-16, 12);
      c.lineTo(-4, 0);
      c.closePath();
      c.fill();

      // Upper wing tip highlight
      c.fillStyle = '#be123c';
      c.beginPath();
      c.moveTo(6, -3);
      c.lineTo(-5, -12);
      c.lineTo(-10, -11);
      c.lineTo(0, -3);
      c.closePath();
      c.fill();

      // Spinning front propeller blur
      const propLen = 7 + Math.sin(timeMs * 0.06) * 4;
      c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(23, -propLen);
      c.lineTo(23, propLen);
      c.stroke();

      c.shadowBlur = 0;
      c.restore();
    };

    const render = (timeMs: number) => {
      const { currentRound: round, multiplier: mult, countdown: count } = stateRef.current;

      // 1. Base black background
      ctx.fillStyle = '#07090d';
      ctx.fillRect(0, 0, width, height);

      // 2. Radiating sunray beams from bottom-left origin (exact Aviator style)
      const originX = 0;
      const originY = height;
      const maxRadius = Math.hypot(width, height) * 1.35;
      const numRays = 36;
      const rayStep = (Math.PI * 2) / numRays;

      if (round.status === 'in_flight') {
        rayAngleOffset += 0.0008;
      }

      ctx.save();
      for (let i = 0; i < numRays; i++) {
        if (i % 2 === 0) {
          const a1 = i * rayStep + rayAngleOffset;
          const a2 = a1 + rayStep * 0.52;
          ctx.beginPath();
          ctx.moveTo(originX, originY);
          ctx.arc(originX, originY, maxRadius, a1, a2);
          ctx.closePath();
          ctx.fillStyle = 'rgba(28, 35, 49, 0.55)';
          ctx.fill();
        }
      }

      // Subtle vignette toward top/edges
      const radGrad = ctx.createRadialGradient(
        originX,
        originY,
        20,
        originX,
        originY,
        maxRadius * 0.85
      );
      radGrad.addColorStop(0, 'rgba(15, 23, 42, 0.15)');
      radGrad.addColorStop(1, 'rgba(4, 6, 10, 0.65)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      if (round.status === 'waiting') {
        const cx = width / 2;
        const cy = height * 0.44;

        // Red propeller icon / loader bar
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('WAITING FOR NEXT ROUND', cx, cy - 22);

        // Progress bar track
        const barW = Math.min(220, width * 0.55);
        const barH = 6;
        const barX = cx - barW / 2;
        const barY = cy + 6;
        const progress = Math.max(0, Math.min(1, count / 5.0));

        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 999);
        ctx.fill();

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * progress, barH, 999);
        ctx.fill();

        ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${count.toFixed(1)}s`, cx, cy + 34);
      } else if (round.status === 'in_flight' || round.status === 'crashed') {
        // Exponential flight curve matching Screenshot 2
        const logMult = Math.log(Math.max(1.01, mult)) / Math.log(12);
        const curveProgress = Math.min(1.0, Math.max(0.18, logMult));

        const startX = 10;
        const startY = height - 6;

        // Map multiplier so at 1.20x it sits roughly around 38% width and 75% height like the screenshot
        const targetXRatio = Math.min(0.76, 0.34 + curveProgress * 0.48);
        const targetYRatio = Math.min(0.76, 0.58 + Math.pow(curveProgress, 0.65) * 0.22);

        const planeX = startX + (width * targetXRatio - startX);
        const planeY = startY - height * targetYRatio;

        // Control point gives the steep upward sweep seen in Aviator
        const controlX = startX + (planeX - startX) * 0.58;
        const controlY = startY - (startY - planeY) * 0.12;

        if (round.status === 'in_flight') {
          // Red translucent shaded area under curve
          const areaGrad = ctx.createLinearGradient(0, planeY, 0, startY);
          areaGrad.addColorStop(0, 'rgba(220, 20, 48, 0.58)');
          areaGrad.addColorStop(1, 'rgba(180, 12, 35, 0.32)');

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(controlX, controlY, planeX, planeY);
          ctx.lineTo(planeX, startY);
          ctx.closePath();
          ctx.fillStyle = areaGrad;
          ctx.fill();

          // Bright crimson trajectory curve stroke
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(controlX, controlY, planeX, planeY);
          ctx.strokeStyle = '#ff1744';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(255, 23, 68, 0.65)';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Red Aviator plane at the curve tip
          drawRedAviatorPlane(ctx, planeX + 10, planeY - 6, -0.32, timeMs);
        }

        // Giant Center Multiplier Text (e.g. "1.20x")
        const cx = width / 2;
        const cy = height * 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const multFontSize = width < 420 ? 56 : width < 640 ? 68 : 78;

        if (round.status === 'crashed') {
          ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('FLEW AWAY!', cx, cy - 18);

          ctx.font = `800 ${multFontSize}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillStyle = '#ef233c';
          ctx.fillText(`${(round.crashMultiplier ?? mult).toFixed(2)}x`, cx, cy + 32);
        } else {
          ctx.font = `800 ${multFontSize}px "Plus Jakarta Sans", sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 12;
          ctx.fillText(`${mult.toFixed(2)}x`, cx, cy);
          ctx.shadowBlur = 0;
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[270px] sm:h-[330px] md:h-[380px] bg-[#07090d] select-none overflow-hidden rounded-2xl border border-white/10">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Bottom-Right Online Players Pill (Exact match to Screenshot 2) */}
      <div className="absolute bottom-2.5 right-2.5 bg-[#1a1d24]/95 border border-white/10 rounded-full px-2.5 py-1 flex items-center gap-2 shadow-lg pointer-events-none">
        <div className="flex items-center -space-x-1.5">
          {/* Avatar 1 */}
          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-sky-300 to-blue-600 border border-[#1a1d24] flex items-center justify-center text-[9px] font-black text-rose-600 shadow-sm">
            A
          </span>
          {/* Avatar 2 */}
          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-300 to-slate-600 border border-[#1a1d24] flex items-center justify-center text-[9px] font-bold text-slate-900 shadow-sm">
            K
          </span>
          {/* Avatar 3 */}
          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-emerald-600 border border-[#1a1d24] flex items-center justify-center text-[9px] font-bold text-white shadow-sm">
            M
          </span>
        </div>
        <span className="text-xs font-medium text-slate-200 tabular-nums pr-0.5">
          {onlineCount}
        </span>
      </div>
    </div>
  );
};
