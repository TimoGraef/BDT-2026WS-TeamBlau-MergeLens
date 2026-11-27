import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { EvaluationHistoryEntry, InferenceResult } from '../types/pr';
import { formatProbability } from '../utils/formatters';

interface MergeLens3DCanvasProps {
  prediction: InferenceResult | null;
  history: EvaluationHistoryEntry[];
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function generateFibonacciSphere(count: number): Vec3[] {
  const points: Vec3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
    });
  }
  return points;
}

function rotatePoint(point: Vec3, rotX: number, rotY: number): Vec3 {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;

  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;

  return { x: x1, y: y2, z: z2 };
}

const SPHERE_POINTS = generateFibonacciSphere(72);
const RING_SEGMENTS = 44;

export function MergeLens3DCanvas({ prediction, history }: MergeLens3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef({ x: 0.35, y: 0 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const [isPaused, setIsPaused] = useState(false);

  const signalRgb = !prediction
    ? '56, 189, 248'
    : prediction.predictedClass === 'merged'
      ? '16, 185, 129'
      : '244, 63, 94';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    let frameId = 0;
    let time = 0;

    const drawRing = (
      cx: number,
      cy: number,
      fov: number,
      baseRadius: number,
      ringRadius: number,
      rx: number,
      ry: number,
      strokeStyle: string,
    ) => {
      ctx.beginPath();
      for (let i = 0; i <= RING_SEGMENTS; i += 1) {
        const angle = (i / RING_SEGMENTS) * Math.PI * 2;
        const rotated = rotatePoint(
          { x: Math.cos(angle) * ringRadius, y: 0, z: Math.sin(angle) * ringRadius },
          rx,
          ry,
        );
        const scale = fov / (fov + rotated.z * baseRadius + 125);
        const px = cx + rotated.x * baseRadius * scale;
        const py = cy + rotated.y * baseRadius * scale;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    const renderFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const fov = 265;
      const baseRadius = 62;

      if (!isPaused && !dragRef.current.active) {
        const speed = prediction?.predictedClass === 'closed_without_merge' ? 0.012 : 0.007;
        rotationRef.current.y += speed;
        rotationRef.current.x = 0.34 + Math.sin(time * 0.45) * 0.16;
      }
      time += 0.016;

      ctx.clearRect(0, 0, width, height);

      // Team Blau ambient halo + active signal core glow
      const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, 118);
      glow.addColorStop(0, `rgba(${signalRgb}, 0.28)`);
      glow.addColorStop(0.55, 'rgba(37, 99, 235, 0.11)');
      glow.addColorStop(1, 'rgba(6, 9, 19, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const { x: rotX, y: rotY } = rotationRef.current;

      // Dual counter-rotating gyroscope lens rings
      drawRing(cx, cy, fov, baseRadius, 1.35, rotX + 0.55, rotY * 0.8, `rgba(${signalRgb}, 0.34)`);
      drawRing(cx, cy, fov, baseRadius, 1.52, -rotX + 0.9, -rotY * 0.6, 'rgba(56, 189, 248, 0.22)');

      // Project Fibonacci sphere nodes back-to-front
      const projected = SPHERE_POINTS.map((point) => {
        const pulse = 1 + Math.sin(time * 2.2 + point.y * 4.5) * 0.04;
        const rotated = rotatePoint(
          { x: point.x * pulse, y: point.y * pulse, z: point.z * pulse },
          rotX,
          rotY,
        );
        const scale = fov / (fov + rotated.z * baseRadius + 125);
        return {
          x: cx + rotated.x * baseRadius * scale,
          y: cy + rotated.y * baseRadius * scale,
          z: rotated.z,
          scale,
        };
      }).sort((a, b) => a.z - b.z);

      // Mesh wireframe edges
      ctx.lineWidth = 0.75;
      for (let i = 0; i < projected.length; i += 1) {
        const a = projected[i];
        if (a.z < -0.15) continue;
        for (let j = i + 1; j < projected.length; j += 1) {
          const b = projected[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 540) {
            const alpha = (1 - distSq / 540) * 0.28;
            ctx.strokeStyle = `rgba(${signalRgb}, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw sphere nodes
      for (const node of projected) {
        const depthAlpha = Math.max(0.2, Math.min(0.96, (node.z + 1.2) / 2.2));
        const dotRadius = Math.max(1.2, 2.7 * node.scale);
        ctx.fillStyle = `rgba(${signalRgb}, ${depthAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw evaluated session PRs as orbiting satellites with subtle tether lines
      history.slice(0, 12).forEach((entry, idx) => {
        const count = Math.max(1, Math.min(history.length, 12));
        const angle = (idx / count) * Math.PI * 2 + time * 0.48;
        const elevation = (entry.result.mergeProbability - 0.5) * 1.15;
        const sat = rotatePoint(
          { x: Math.cos(angle) * 1.56, y: -elevation, z: Math.sin(angle) * 1.56 },
          rotX,
          rotY,
        );
        const scale = fov / (fov + sat.z * baseRadius + 125);
        const sx = cx + sat.x * baseRadius * scale;
        const sy = cy + sat.y * baseRadius * scale;
        const isMerged = entry.result.predictedClass === 'merged';
        const color = isMerged ? '#10b981' : '#f43f5e';

        ctx.strokeStyle = isMerged ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.22)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(3.2, 4.8 * scale), 0, Math.PI * 2);
        ctx.fill();

        if (sat.z > -0.2 && typeof ctx.fillText === 'function') {
          ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
          ctx.font = '600 9px ui-monospace, monospace';
          ctx.fillText(`#${entry.pr.number}`, sx + 6, sy + 3);
        }
      });

      frameId = window.requestAnimationFrame(renderFrame);
    };

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPaused, prediction, history, signalRgb]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.lastX;
    const dy = event.clientY - dragRef.current.lastY;
    rotationRef.current.y += dx * 0.01;
    rotationRef.current.x = Math.max(-1.2, Math.min(1.2, rotationRef.current.x + dy * 0.01));
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastY = event.clientY;
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  return (
    <section className="card orb-card" aria-label="Interactive 3D signal visualization">
      <div className="orb-header">
        <div>
          <h2 className="card-title">3D Signal Lens</h2>
          <p className="card-description">
            Drag to orbit &middot;{' '}
            {prediction
              ? `Live score ${formatProbability(prediction.mergeProbability)}`
              : 'Awaiting PR evaluation'}
          </p>
        </div>
        <div className="orb-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              rotationRef.current = { x: 0.35, y: 0 };
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsPaused((prev) => !prev)}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="orb-stage">
        <canvas
          ref={canvasRef}
          width={330}
          height={225}
          className="orb-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="orb-legend">
        <span>
          <i className="legend-dot legend-dot--positive" /> Likely Merged
        </span>
        <span>
          <i className="legend-dot legend-dot--negative" /> Likely Closed
        </span>
        <span className="muted-text">{history.length} orbiting PRs</span>
      </div>
    </section>
  );
}
