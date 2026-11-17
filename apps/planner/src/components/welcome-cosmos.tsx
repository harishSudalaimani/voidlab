"use client";

import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 50_000;
const TWINKLE_COUNT = 240;
const EDGE = 36;
const TWO_PI = Math.PI * 2;

type Twinkle = { x: number; y: number; phase: number; speed: number; color: string };

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function WelcomeCosmos({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;
    const surface = canvas as HTMLCanvasElement;
    const drawingContext = context as CanvasRenderingContext2D;

    let layer: HTMLCanvasElement | null = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let animationFrame = 0;
    let twinkles: Twinkle[] = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function createStarLayer() {
      const bounds = surface.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      surface.width = Math.round(width * pixelRatio);
      surface.height = Math.round(height * pixelRatio);

      layer = document.createElement("canvas");
      layer.width = Math.round((width + EDGE * 2) * pixelRatio);
      layer.height = Math.round((height + EDGE * 2) * pixelRatio);
      const layerContext = layer.getContext("2d");
      if (!layerContext) return;
      layerContext.scale(pixelRatio, pixelRatio);

      const centerX = EDGE + width * 0.62;
      const centerY = EDGE + height * 0.5;
      const maxRadius = Math.max(width, height) * 0.78;
      const haze = layerContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius);
      haze.addColorStop(0, theme === "light" ? "rgba(198, 61, 112, 0.12)" : "rgba(178, 231, 84, 0.13)");
      haze.addColorStop(0.38, theme === "light" ? "rgba(124, 82, 145, 0.06)" : "rgba(222, 192, 123, 0.065)");
      haze.addColorStop(1, theme === "light" ? "rgba(198, 61, 112, 0)" : "rgba(178, 231, 84, 0)");
      layerContext.fillStyle = haze;
      layerContext.fillRect(0, 0, width + EDGE * 2, height + EDGE * 2);

      const colors = theme === "light"
        ? ["#b93468", "#76508d", "#467b74", "#d47951"]
        : ["#c9f47c", "#e6c474", "#8edfc9", "#a8d998"];
      twinkles = [];
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        let x: number;
        let y: number;
        const armStar = index >= 17_000;

        if (armStar) {
          const radius = Math.sqrt(Math.random()) * maxRadius;
          const arm = index % 4;
          const spread = 0.1 + (radius / maxRadius) * 0.2;
          const noise = (Math.random() + Math.random() + Math.random() - 1.5) * spread;
          const angle = arm * (TWO_PI / 4) + radius * 0.009 + noise;
          x = centerX + Math.cos(angle) * radius;
          y = centerY + Math.sin(angle) * radius * 0.66;
        } else {
          x = randomBetween(0, width + EDGE * 2);
          y = randomBetween(0, height + EDGE * 2);
        }

        const size = armStar ? randomBetween(0.65, 1.45) : randomBetween(0.55, 1.1);
        const color = colors[Math.floor(Math.random() * colors.length)];
        layerContext.globalAlpha = armStar ? randomBetween(0.42, 0.78) : randomBetween(0.3, 0.62);
        layerContext.fillStyle = color;
        layerContext.fillRect(x, y, size, size);

        if (twinkles.length < TWINKLE_COUNT && index % 173 === 0) {
          twinkles.push({ x, y, phase: randomBetween(0, TWO_PI), speed: randomBetween(0.0005, 0.0013), color });
        }
      }
      layerContext.globalAlpha = 1;
    }

    function draw(time: number) {
      if (!layer) return;
      const offsetX = (Math.sin(time * 0.00028) + 1) * EDGE;
      const offsetY = (Math.cos(time * 0.00022) + 1) * EDGE;
      const sourceX = Math.round(offsetX * pixelRatio);
      const sourceY = Math.round(offsetY * pixelRatio);
      drawingContext.clearRect(0, 0, surface.width, surface.height);
      drawingContext.drawImage(
        layer,
        sourceX,
        sourceY,
        Math.round(width * pixelRatio),
        Math.round(height * pixelRatio),
        0,
        0,
        surface.width,
        surface.height,
      );

      if (!reduceMotion) {
        drawingContext.save();
        drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        for (const star of twinkles) {
          const x = star.x - offsetX;
          const y = star.y - offsetY;
          if (x < 0 || y < 0 || x > width || y > height) continue;
          drawingContext.globalAlpha = 0.2 + (Math.sin(time * star.speed + star.phase) + 1) * 0.28;
          drawingContext.fillStyle = star.color;
          drawingContext.fillRect(x, y, 1, 1);
        }
        drawingContext.restore();
      }

      if (!reduceMotion) animationFrame = window.requestAnimationFrame(draw);
    }

    function resize() {
      const bounds = surface.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);
      const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (layer && nextWidth === width && nextHeight === height && nextPixelRatio === pixelRatio) return;
      window.cancelAnimationFrame(animationFrame);
      createStarLayer();
      draw(performance.now());
    }

    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(animationFrame);
      } else if (!reduceMotion) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.cancelAnimationFrame(animationFrame);
      layer = null;
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="welcome-cosmos-canvas" aria-hidden="true" />;
}
