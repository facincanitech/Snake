/**
 * Grid implementations: Square, Hex, Tri
 * Each exposes:
 *   cellCenter(r, c, cellSize) → {x, y}
 *   canvasSize(rows, cols, cellSize) → {w, h}
 *   drawBackground(ctx, rows, cols, cellSize, theme)
 */

export const Grid = {

  // ── SQUARE / RECT ─────────────────────────────────────────────────────────
  square: {
    cellCenter(r, c, cs) {
      return { x: c * cs + cs / 2, y: r * cs + cs / 2 };
    },
    canvasSize(rows, cols, cs) {
      return { w: cols * cs, h: rows * cs };
    },
    drawBackground(ctx, rows, cols, cs) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * cs); ctx.lineTo(cols * cs, r * cs); ctx.stroke();
      }
      for (let c = 0; c <= cols; c++) {
        ctx.beginPath(); ctx.moveTo(c * cs, 0); ctx.lineTo(c * cs, rows * cs); ctx.stroke();
      }
    },
  },

  // rect is identical to square (different aspect ratio handled by rows/cols)
  get rect() { return this.square; },

  // ── HEXAGONAL ──────────────────────────────────────────────────────────────
  hex: {
    _size(cs) { return cs * 0.52; },

    cellCenter(r, c, cs) {
      const s = this._size(cs);
      const w = s * Math.sqrt(3);
      const h = s * 2;
      return {
        x: c * w + (r % 2) * (w / 2) + w / 2 + 2,
        y: r * h * 0.75 + h / 2 + 2,
      };
    },

    canvasSize(rows, cols, cs) {
      const s = this._size(cs);
      const w = s * Math.sqrt(3);
      const h = s * 2;
      return { w: cols * w + w / 2 + 4, h: rows * h * 0.75 + h / 4 + 4 };
    },

    _corners(cx, cy, s) {
      return Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return { x: cx + s * Math.cos(a), y: cy + s * Math.sin(a) };
      });
    },

    drawBackground(ctx, rows, cols, cs) {
      const s = this._size(cs) - 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const { x, y } = this.cellCenter(r, c, cs);
          const pts = this._corners(x, y, s);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.stroke();
        }
      }
    },
  },

  // ── TRIANGULAR ─────────────────────────────────────────────────────────────
  tri: {
    _h(cs) { return cs * Math.sqrt(3) / 2; },

    _isUp(r, c) { return (r + c) % 2 === 0; },

    cellCenter(r, c, cs) {
      const h = this._h(cs);
      const isUp = this._isUp(r, c);
      return {
        x: c * cs / 2 + cs / 2,
        y: r * h + (isUp ? h * 0.62 : h * 0.38),
      };
    },

    canvasSize(rows, cols, cs) {
      const h = this._h(cs);
      return { w: (cols + 1) * cs / 2 + 2, h: rows * h + h + 2 };
    },

    _verts(r, c, cs) {
      const h = this._h(cs);
      const isUp = this._isUp(r, c);
      const bx = c * cs / 2, by = r * h;
      return isUp
        ? [{ x: bx, y: by + h }, { x: bx + cs, y: by + h }, { x: bx + cs / 2, y: by }]
        : [{ x: bx, y: by },     { x: bx + cs, y: by },     { x: bx + cs / 2, y: by + h }];
    },

    drawBackground(ctx, rows, cols, cs) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const pts = this._verts(r, c, cs);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.stroke();
        }
      }
    },
  },
};
