import { useEffect, useRef } from "react";
import { FIREWORKS, FIREWORK_FLIGHT } from "./fireworks";

/** One canvas keeps the finale light on DOM layout, even with hundreds of sparks. */
export function FireworksCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!canvas || motion.matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = innerWidth, height = innerHeight, frame = 0;
    const resize = () => {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * ratio; canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);
    const started = performance.now();
    const draw = (now: number) => {
      const time = (now - started) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      for (let star = 0; star < 65; star++) {
        ctx.globalAlpha = .12 + .15 * Math.sin(time * 2 + star) ** 2;
        ctx.fillStyle = "#e9e7ff";
        ctx.fillRect((star * 137.7 % width), (star * 91.3 % height), 1.2, 1.2);
      }
      FIREWORKS.forEach((shell, shellIndex) => {
        const age = time - shell.delay;
        if (age < 0 || age > FIREWORK_FLIGHT + 2) return;
        const x = width * shell.x / 100, y = height * shell.y / 100;
        const finale = shellIndex >= FIREWORKS.length - 3;
        ctx.strokeStyle = shell.color; ctx.fillStyle = shell.color;
        if (age < FIREWORK_FLIGHT) {
          const progress = age / FIREWORK_FLIGHT;
          const rocketY = height + 25 - (height + 25 - y) * progress;
          ctx.globalAlpha = Math.min(1, progress * 5);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, rocketY + 70); ctx.lineTo(x, rocketY); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, rocketY, 3, 0, Math.PI * 2); ctx.fill();
          return;
        }
        const burst = age - FIREWORK_FLIGHT;
        const radius = Math.min(width * .47, finale ? 255 : 175);
        const count = finale ? 125 : 75;
        // Bloom from the ignition, then a long falling willow of glittering embers.
        if (burst < .35) {
          ctx.globalAlpha = .32 * (1 - burst / .35);
          const bloom = ctx.createRadialGradient(x, y, 0, x, y, radius * .7);
          bloom.addColorStop(0, shell.color); bloom.addColorStop(1, "transparent");
          ctx.fillStyle = bloom; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        for (let spark = 0; spark < count; spark++) {
          const angle = spark * Math.PI * 2 / count + shellIndex * .39;
          const reach = radius * (.52 + (spark * 17 % 49) / 100);
          const point = (t: number) => {
            const travel = 1 - Math.exp(-4 * Math.max(0, t));
            return [x + Math.cos(angle) * reach * travel, y + Math.sin(angle) * reach * travel + 62 * t * t];
          };
          const [px, py] = point(burst), [tx, ty] = point(Math.max(0, burst - .055));
          const shimmer = burst < .65 ? 1 : .55 + .45 * Math.sin(spark * 11 + time * 24) ** 2;
          ctx.globalAlpha = Math.max(0, (1 - burst / 2) ** 1.4) * shimmer;
          ctx.strokeStyle = spark % 4 === 0 ? "#fff2ba" : shell.color;
          ctx.lineWidth = spark % 3 === 0 ? 2 : 1.2;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
          ctx.fillStyle = spark % 3 === 0 ? "#fff" : shell.color;
          ctx.beginPath(); ctx.arc(px, py, burst < .3 ? 2 : 1.2, 0, Math.PI * 2); ctx.fill();
          if (spark % 7 === 0 && burst > .5) {
            ctx.globalAlpha *= .5;
            ctx.fillRect(px - 4, py + 12 * burst, 1.5, 1.5);
            ctx.fillRect(px + 6, py + 20 * burst, 1.5, 1.5);
          }
        }
      });
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    const stop = () => { if (motion.matches) { cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); } };
    motion.addEventListener("change", stop);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); motion.removeEventListener("change", stop); };
  }, []);
  return <canvas className="win-fireworks-canvas" ref={ref} data-shells={FIREWORKS.length} />;
}
