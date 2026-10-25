import type { Camera } from "./camera";
import { COLORS } from "./colors";
import type { FeedbackKind } from "./input";

const MARKER_MS = 500;

interface Marker {
  x: number;
  y: number;
  color: string;
  shape: "ring" | "cross" | "flag";
  start: number;
}

/**
 * Instant acknowledgement of every command (GDD MUST): a marker where the player clicked and a
 * short click sound, shown before the server (or sandbox) has applied the command.
 */
export class Feedback {
  private markers: Marker[] = [];
  private audio: AudioContext | null = null;
  muted = false;

  onCommand(kind: FeedbackKind, at: { x: number; y: number } | null): void {
    const now = performance.now();
    if (at) {
      const color = kind === "attack" ? COLORS.attack : kind === "rally" ? COLORS.rally : COLORS.move;
      const shape = kind === "attack" ? "cross" : kind === "rally" ? "flag" : "ring";
      this.markers.push({ ...at, color, shape, start: now });
    }
    this.click(kind === "attack" ? 520 : kind === "train" ? 880 : 660);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, now: number): void {
    this.markers = this.markers.filter((m) => now - m.start < MARKER_MS);
    for (const m of this.markers) {
      const t = (now - m.start) / MARKER_MS;
      const p = camera.toScreen(m.x, m.y);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = m.color;
      ctx.fillStyle = m.color;
      ctx.lineWidth = 2;
      if (m.shape === "cross") {
        const s = 10 - t * 4;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y - s);
        ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x + s, p.y - s);
        ctx.lineTo(p.x - s, p.y + s);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 6 + t * 14, (6 + t * 14) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (m.shape === "flag") {
        ctx.fillRect(p.x - 1, p.y - 18, 2, 18);
      }
      ctx.restore();
    }
  }

  /** A 60 ms blip. Browsers allow audio after a user gesture, which every command is. */
  private click(frequency: number): void {
    if (this.muted) return;
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch {
      // Audio unavailable (e.g. blocked autoplay); the visual marker still shows.
    }
  }
}
