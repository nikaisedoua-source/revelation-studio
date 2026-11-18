/* Révélation Studio — Assistant projet.
   Generates a complete short film locally: procedural cinematic shots, title
   overlays, an original music cue and a frame-accurate edit plan. System voice
   is produced by the desktop bridge or the local Studio server when available. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.StudioProjectAssistant = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STYLES = {
    ambre: {
      label: 'Ambre', background: ['#150e08', '#2b1a0d', '#5c3518'],
      accent: '#e3b36d', light: '#f6dcae', cool: '#86a9ab', ink: '#f7ecda'
    },
    acier: {
      label: 'Acier', background: ['#070a10', '#101c27', '#223a49'],
      accent: '#8fc4d8', light: '#dcf0f7', cool: '#b9a9d9', ink: '#eef5f7'
    },
    nuit: {
      label: 'Nuit', background: ['#06070c', '#0d1021', '#1e2444'],
      accent: '#9d94e8', light: '#dbd5ff', cool: '#71b6c9', ink: '#f1effc'
    },
    neon: {
      label: 'Néon', background: ['#060b0b', '#0b1d1a', '#123b33'],
      accent: '#6ee7c0', light: '#d7fff3', cool: '#ee8cc9', ink: '#ecfffa'
    }
  };

  const DEFAULT_LINES = [
    { title: 'UNE IDÉE', subtitle: 'Tout commence par une idée.' },
    { title: 'UN MONTAGE', subtitle: 'Les images prennent leur place.' },
    { title: 'UNE IMAGE', subtitle: 'Chaque plan raconte quelque chose.' },
    { title: 'UN SON', subtitle: 'La voix et la musique portent le sens.' },
    { title: 'UN STUDIO', subtitle: 'Tout se fabrique ici, sans quitter l’application.' },
    { title: 'UNE RÉVÉLATION', subtitle: 'Le film est prêt.' }
  ];

  const MOTIFS = ['idée', 'montage', 'image', 'son', 'studio', 'révélation'];

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, Number(value) || 0));
  }

  function hashString(text) {
    let hash = 2166136261;
    const value = String(text == null ? '' : text);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6D2B79F5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function palette(style) {
    return STYLES[style] || STYLES.ambre;
  }

  function slug(text) {
    return String(text || 'film').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'film';
  }

  function buildPlan(options) {
    const opts = options || {};
    const style = STYLES[opts.style] ? opts.style : 'ambre';
    const duration = clamp(opts.duration || 30, 12, 120);
    const fps = [24, 25, 30, 50, 60].includes(Number(opts.fps)) ? Number(opts.fps) : 30;
    const width = Math.max(320, Math.round(Number(opts.width) || 1920));
    const height = Math.max(180, Math.round(Number(opts.height) || 1080));
    const subject = String(opts.subject || 'Révélation Studio').trim().slice(0, 80) || 'Révélation Studio';
    const signature = String(opts.signature || 'Fabriqué de bout en bout dans Révélation Studio.').trim().slice(0, 120);
    const lines = Array.isArray(opts.lines) && opts.lines.length === 6
      ? opts.lines.map((line, index) => ({
        title: String(line.title || DEFAULT_LINES[index].title).slice(0, 48),
        subtitle: String(line.subtitle || DEFAULT_LINES[index].subtitle).slice(0, 140)
      }))
      : DEFAULT_LINES;

    const totalFrames = Math.max(6, Math.round(duration * fps));
    const baseFrames = Math.floor(totalFrames / lines.length);
    const extraFrames = totalFrames - baseFrames * lines.length;
    const seed = hashString(`${subject}|${style}|${duration}|${fps}`);

    let frameCursor = 0;
    const shots = lines.map((line, index) => {
      const frames = baseFrames + (index < extraFrames ? 1 : 0);
      const shot = {
        id: `shot-${String(index + 1).padStart(2, '0')}`,
        index,
        number: index + 1,
        motif: MOTIFS[index],
        title: line.title,
        subtitle: line.subtitle,
        start: frameCursor / fps,
        duration: frames / fps,
        prompt: `${MOTIFS[index]} · ${line.title} · ${subject}`
      };
      frameCursor += frames;
      return shot;
    });

    return {
      schema: 1,
      subject,
      signature,
      style,
      styleLabel: STYLES[style].label,
      seed,
      width,
      height,
      fps,
      duration: frameCursor / fps,
      shots,
      overlays: shots.map((shot) => ({
        shotId: shot.id,
        start: shot.start,
        duration: shot.duration,
        title: shot.title,
        subtitle: shot.subtitle
      })),
      voices: shots.map((shot) => ({
        shotId: shot.id,
        start: shot.start,
        duration: shot.duration,
        text: shot.subtitle
      })),
      music: { start: 0, duration: frameCursor / fps, style, seed },
      defaultName: `${subject} · ${Math.round(frameCursor / fps)} s`,
      filePrefix: `ASST-${slug(subject)}-${fps}`
    };
  }

  /* ------------------------------------------------------------------ drawing */

  function roundedPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function glow(ctx, x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function baseGradient(ctx, width, height, colors) {
    const gradient = ctx.createLinearGradient(0, 0, width * 0.35, height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.55, colors[1]);
    gradient.addColorStop(1, colors[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const halo = ctx.createRadialGradient(width * 0.5, height * 0.38, 0, width * 0.5, height * 0.38, height * 0.8);
    halo.addColorStop(0, 'rgba(255,255,255,0.08)');
    halo.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
  }

  function vignette(ctx, width, height, strength) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.74);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${strength == null ? 0.62 : strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function grain(ctx, width, height, random) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let index = 0; index < 1500; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const light = random() > 0.5;
      ctx.fillStyle = light ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
      ctx.fillRect(x, y, 1 + random() * 1.6, 1 + random() * 1.6);
    }
    ctx.restore();
  }

  function softFrame(ctx, width, height, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = Math.max(1, width / 1600);
    const inset = Math.round(width * 0.045);
    const corner = Math.round(width * 0.035);
    const top = Math.round(height * 0.075);
    const bottom = height - Math.round(height * 0.075);
    const lines = [
      [inset, top, inset + corner, top], [inset, top, inset, top + corner],
      [width - inset, top, width - inset - corner, top], [width - inset, top, width - inset, top + corner],
      [inset, bottom, inset + corner, bottom], [inset, bottom, inset, bottom - corner],
      [width - inset, bottom, width - inset - corner, bottom], [width - inset, bottom, width - inset, bottom - corner]
    ];
    for (const [x1, y1, x2, y2] of lines) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function shotIdea(ctx, width, height, colors, random) {
    const cx = width * 0.5;
    const cy = height * 0.43;
    const radius = height * 0.11;
    glow(ctx, cx, cy, radius * 4.6, colors.accent, 0.2);
    glow(ctx, cx, cy, radius * 2.1, colors.light, 0.55);
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.38 + ring * 0.34);
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.2 - ring * 0.045;
      ctx.lineWidth = Math.max(1, width / 1200);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (2.2 + ring * 0.62), radius * (0.58 + ring * 0.1), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = colors.light;
      const angle = random() * Math.PI * 2;
      const ex = Math.cos(angle) * radius * (2.2 + ring * 0.62);
      const ey = Math.sin(angle) * radius * (0.58 + ring * 0.1);
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.5, width / 900), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.42, colors.light);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    const horizon = height * 0.7;
    const reflection = ctx.createLinearGradient(0, horizon, 0, height);
    reflection.addColorStop(0, 'rgba(0,0,0,0.55)');
    reflection.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    reflection.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = reflection;
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let ray = 0; ray < 26; ray += 1) {
      const angle = (ray / 26) * Math.PI * 2 + random() * 0.08;
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.035;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius * 3.4, cy + Math.sin(angle) * radius * 3.4);
      ctx.lineTo(cx + Math.cos(angle) * Math.max(width, height), cy + Math.sin(angle) * Math.max(width, height));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let dot = 0; dot < 46; dot += 1) {
      const x = random() * width;
      const y = horizon - random() * height * 0.55;
      ctx.fillStyle = colors.light;
      ctx.globalAlpha = 0.18 + random() * 0.38;
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function filmFrame(ctx, x, y, width, height, colors, random) {
    const background = Array.isArray(colors.background) ? colors.background : colors;
    ctx.save();
    ctx.translate(x, y);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, background[2]);
    sky.addColorStop(1, background[0]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    glow(ctx, width * 0.66, height * 0.35, height * 0.3, colors.light, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * 0.68);
    for (let step = 0; step <= 8; step += 1) {
      ctx.lineTo((step / 8) * width, height * (0.55 + random() * 0.18));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(width * 0.66, height * 0.35, height * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function shotMontage(ctx, width, height, colors, random) {
    const strips = [
      { x: width * 0.28, y: height * 0.3, length: width * 0.72, thickness: height * 0.19, angle: -0.22 },
      { x: width * 0.72, y: height * 0.63, length: width * 0.66, thickness: height * 0.16, angle: 0.14 },
      { x: width * 0.5, y: height * 0.47, length: width * 0.58, thickness: height * 0.14, angle: -0.04 }
    ];
    for (const strip of strips) {
      ctx.save();
      ctx.translate(strip.x, strip.y);
      ctx.rotate(strip.angle);
      ctx.fillStyle = 'rgba(8,8,10,0.78)';
      roundedPath(ctx, -strip.length / 2, -strip.thickness / 2, strip.length, strip.thickness, strip.thickness * 0.08);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1, width / 1400);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const frames = 4;
      const frameWidth = (strip.length * 0.9) / frames;
      for (let index = 0; index < frames; index += 1) {
        const x = -strip.length * 0.45 + index * frameWidth;
        const y = -strip.thickness * 0.3;
        ctx.save();
        roundedPath(ctx, x + frameWidth * 0.06, y, frameWidth * 0.88, strip.thickness * 0.6, 4);
        ctx.clip();
        filmFrame(ctx, x + frameWidth * 0.06, y, strip.thickness * 0.6, frameWidth * 0.88, colors, random);
        ctx.restore();
      }
      ctx.fillStyle = colors.accent;
      for (let hole = 0; hole < Math.floor(strip.length / 26); hole += 1) {
        const x = -strip.length / 2 + 13 + hole * 26;
        ctx.globalAlpha = 0.5;
        roundedPath(ctx, x, -strip.thickness * 0.46, 10, 5, 1.5);
        ctx.fill();
        roundedPath(ctx, x, strip.thickness * 0.38, 10, 5, 1.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.save();
    const frameX = width * 0.54;
    const frameY = height * 0.14;
    const frameW = width * 0.31;
    const frameH = frameW * 0.56;
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#08090b';
    roundedPath(ctx, frameX - 8, frameY - 8, frameW + 16, frameH + 16, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    roundedPath(ctx, frameX, frameY, frameW, frameH, 3);
    ctx.clip();
    filmFrame(ctx, frameX, frameY, frameW, frameH, colors, random);
    ctx.restore();
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, width / 900);
    roundedPath(ctx, frameX, frameY, frameW, frameH, 3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.light;
    ctx.font = `${Math.round(height * 0.019)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('00:00:12:04', frameX, frameY + frameH + Math.round(height * 0.042));
    ctx.restore();
    ctx.strokeStyle = colors.cool;
    ctx.globalAlpha = 0.35;
    for (let tick = 0; tick < 20; tick += 1) {
      const x = width * 0.08 + tick * width * 0.045;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.82);
      ctx.lineTo(x, height * (tick % 4 === 0 ? 0.86 : 0.84));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function shotImage(ctx, width, height, colors, random) {
    const horizon = height * 0.63;
    glow(ctx, width * 0.69, height * 0.31, height * 0.26, colors.light, 0.55);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, 'rgba(255,255,255,0)');
    sky.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    sky.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let step = 0; step <= 10; step += 1) {
      ctx.lineTo((step / 10) * width * 0.82, horizon - height * (0.05 + random() * 0.11));
    }
    ctx.lineTo(width * 0.82, horizon);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.46)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let step = 0; step <= 8; step += 1) {
      ctx.lineTo((step / 8) * width, horizon - height * (0.015 + random() * 0.05));
    }
    ctx.lineTo(width, horizon);
    ctx.closePath();
    ctx.fill();
    const water = ctx.createLinearGradient(0, horizon, 0, height);
    water.addColorStop(0, 'rgba(255,255,255,0.12)');
    water.addColorStop(0.22, 'rgba(0,0,0,0.42)');
    water.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = colors.light;
    ctx.globalAlpha = 0.1;
    for (let line = 0; line < 18; line += 1) {
      const y = horizon + (line / 18) * (height - horizon);
      ctx.beginPath();
      ctx.moveTo(width * (0.5 - line * 0.02), y);
      ctx.lineTo(width * (0.5 + line * 0.02), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const headX = width * 0.73;
    const headY = height * 0.46;
    const headR = height * 0.052;
    ctx.fillStyle = 'rgba(4,5,7,0.92)';
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.7, headY + headR * 0.7);
    ctx.bezierCurveTo(headX - headR * 3.4, headY + headR * 1.5, headX - headR * 4.1, height, headX - headR * 3.9, height);
    ctx.lineTo(headX + headR * 3.9, height);
    ctx.bezierCurveTo(headX + headR * 4.1, height, headX + headR * 3.4, headY + headR * 1.5, headX + headR * 0.7, headY + headR * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = Math.max(1, width / 1300);
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.12);
    ctx.lineTo(width * 0.92, height * 0.12);
    ctx.lineTo(width * 0.92, height * 0.88);
    ctx.lineTo(width * 0.08, height * 0.88);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.light;
    ctx.globalAlpha = 0.5;
    ctx.font = `${Math.round(height * 0.017)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('24 mm · T2.0 · 1/48', width * 0.085, height * 0.915);
    ctx.globalAlpha = 1;
    for (let mote = 0; mote < 60; mote += 1) {
      const x = width * 0.5 + (random() - 0.5) * width * 0.6;
      const y = height * 0.2 + random() * height * 0.42;
      ctx.fillStyle = colors.light;
      ctx.globalAlpha = 0.12 + random() * 0.3;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function shotSound(ctx, width, height, colors, random) {
    const cx = width * 0.5;
    const cy = height * 0.44;
    glow(ctx, cx, cy, height * 0.32, colors.accent, 0.22);
    for (let ring = 0; ring < 5; ring += 1) {
      const radius = height * (0.09 + ring * 0.052);
      ctx.strokeStyle = ring % 2 ? colors.cool : colors.accent;
      ctx.globalAlpha = 0.42 - ring * 0.06;
      ctx.lineWidth = Math.max(1, width / 900);
      ctx.beginPath();
      for (let step = 0; step <= 180; step += 1) {
        const angle = (step / 180) * Math.PI * 2;
        const wave = Math.sin(angle * (5 + ring) + ring * 1.4) * height * (0.008 + ring * 0.0035);
        const x = cx + Math.cos(angle) * (radius + wave);
        const y = cy + Math.sin(angle) * (radius + wave);
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    glow(ctx, cx, cy, height * 0.05, '#ffffff', 0.9);
    const baseY = height * 0.68;
    const points = 260;
    ctx.beginPath();
    for (let index = 0; index <= points; index += 1) {
      const x = (index / points) * width;
      const phase = index / points;
      const envelope = Math.sin(Math.PI * phase);
      const amplitude = (Math.sin(phase * 19 + 1.2) * 0.5 + Math.sin(phase * 47 + 0.3) * 0.3 + Math.sin(phase * 91) * 0.18) * envelope;
      const y = baseY - amplitude * height * 0.11;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let index = points; index >= 0; index -= 1) {
      const x = (index / points) * width;
      const phase = index / points;
      const envelope = Math.sin(Math.PI * phase);
      const amplitude = (Math.sin(phase * 19 + 1.2) * 0.5 + Math.sin(phase * 47 + 0.3) * 0.3 + Math.sin(phase * 91) * 0.18) * envelope;
      ctx.lineTo(x, baseY + amplitude * height * 0.11);
    }
    ctx.closePath();
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = colors.light;
    ctx.lineWidth = Math.max(1, width / 1100);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const bars = 30;
    for (let bar = 0; bar < bars; bar += 1) {
      const x = width * 0.1 + (bar / (bars - 1)) * width * 0.8;
      const level = (0.12 + random() * 0.72) * (0.4 + Math.sin((bar / bars) * Math.PI) * 0.6);
      const barHeight = level * height * 0.16;
      ctx.fillStyle = bar % 3 === 0 ? colors.light : colors.accent;
      ctx.globalAlpha = 0.32 + random() * 0.28;
      const barWidth = width * 0.012;
      ctx.fillRect(x - barWidth / 2, height * 0.86 - barHeight, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  }

  function shotStudio(ctx, width, height, colors, random) {
    const vpX = width * 0.5;
    const vpY = height * 0.5;
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = Math.max(1, width / 1500);
    for (let index = -8; index <= 8; index += 1) {
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(vpX + index * width * 0.14, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(vpX + index * width * 0.14, 0);
      ctx.stroke();
    }
    for (let step = 1; step <= 7; step += 1) {
      const factor = Math.pow(step / 7, 1.8);
      const yLow = vpY + factor * (height - vpY);
      const yHigh = vpY - factor * vpY;
      ctx.beginPath();
      ctx.moveTo(width * (0.5 - factor * 0.62), yLow);
      ctx.lineTo(width * (0.5 + factor * 0.62), yLow);
      ctx.moveTo(width * (0.5 - factor * 0.62), yHigh);
      ctx.lineTo(width * (0.5 + factor * 0.62), yHigh);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    glow(ctx, vpX, vpY, height * 0.24, colors.light, 0.16);
    const panels = [
      { x: width * 0.12, y: height * 0.22, w: width * 0.19, h: height * 0.24, angle: -0.03, kind: 'color' },
      { x: width * 0.7, y: height * 0.18, w: width * 0.19, h: height * 0.22, angle: 0.035, kind: 'timeline' },
      { x: width * 0.38, y: height * 0.56, w: width * 0.24, h: height * 0.14, angle: -0.012, kind: 'wave' }
    ];
    for (const panel of panels) {
      ctx.save();
      ctx.translate(panel.x + panel.w / 2, panel.y + panel.h / 2);
      ctx.rotate(panel.angle);
      ctx.fillStyle = 'rgba(8,10,14,0.74)';
      roundedPath(ctx, -panel.w / 2, -panel.h / 2, panel.w, panel.h, width * 0.008);
      ctx.fill();
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = Math.max(1, width / 1300);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(-panel.w / 2 + 10, -panel.h / 2 + 10, panel.w * 0.24, 3);
      ctx.globalAlpha = 1;
      if (panel.kind === 'color') {
        const wheels = [colors.accent, colors.cool, colors.light];
        for (let wheel = 0; wheel < 3; wheel += 1) {
          const x = -panel.w * 0.28 + wheel * panel.w * 0.28;
          const y = panel.h * 0.06;
          const r = panel.h * 0.14;
          ctx.strokeStyle = wheels[wheel];
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - r, y);
          ctx.lineTo(x + r, y);
          ctx.moveTo(x, y - r);
          ctx.lineTo(x, y + r);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x + Math.cos(wheel * 2.1) * r * 0.5, y + Math.sin(wheel * 2.1) * r * 0.5, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (panel.kind === 'timeline') {
        const colorsRow = [colors.accent, colors.cool, colors.light, colors.accent];
        for (let row = 0; row < 4; row += 1) {
          const y = -panel.h * 0.24 + row * panel.h * 0.16;
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(-panel.w * 0.42, y, panel.w * 0.84, panel.h * 0.1);
          ctx.fillStyle = colorsRow[row];
          ctx.globalAlpha = 0.55;
          ctx.fillRect(-panel.w * 0.42 + random() * panel.w * 0.3, y, panel.w * (0.12 + random() * 0.3), panel.h * 0.1);
          ctx.globalAlpha = 1;
        }
      } else {
        const y = 0;
        ctx.strokeStyle = colors.light;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = Math.max(1, width / 1200);
        ctx.beginPath();
        for (let index = 0; index <= 90; index += 1) {
          const x = -panel.w * 0.42 + (index / 90) * panel.w * 0.84;
          const amplitude = Math.sin((index / 90) * Math.PI * 6) * panel.h * 0.22 * Math.sin((index / 90) * Math.PI);
          if (index === 0) ctx.moveTo(x, y + amplitude);
          else ctx.lineTo(x, y + amplitude);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.25;
    for (let mote = 0; mote < 48; mote += 1) {
      const x = random() * width;
      const y = height * 0.6 + random() * height * 0.34;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function shotRevelation(ctx, width, height, colors, random) {
    const cx = width * 0.5;
    const cy = height * 0.4;
    glow(ctx, cx, cy, height * 0.48, colors.accent, 0.26);
    for (let ray = 0; ray < 54; ray += 1) {
      const angle = (ray / 54) * Math.PI * 2 + (random() - 0.5) * 0.05;
      const inner = height * (0.07 + random() * 0.05);
      const outer = height * (0.45 + random() * 0.6);
      ctx.strokeStyle = ray % 3 === 0 ? colors.light : colors.accent;
      ctx.globalAlpha = 0.05 + random() * 0.13;
      ctx.lineWidth = Math.max(1, width / 1400);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.strokeStyle = colors.accent;
      ctx.globalAlpha = 0.35 - ring * 0.08;
      ctx.lineWidth = Math.max(1, width / 1100);
      ctx.beginPath();
      ctx.arc(cx, cy, height * (0.15 + ring * 0.07), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    const size = height * 0.075;
    const diamond = ctx.createLinearGradient(-size, -size, size, size);
    diamond.addColorStop(0, '#ffffff');
    diamond.addColorStop(0.5, colors.light);
    diamond.addColorStop(1, colors.accent);
    ctx.fillStyle = diamond;
    roundedPath(ctx, -size / 2, -size / 2, size, size, size * 0.08);
    ctx.fill();
    ctx.restore();
    const horizon = height * 0.74;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, horizon, width, height - horizon);
    const reflection = ctx.createLinearGradient(0, horizon, 0, height);
    reflection.addColorStop(0, 'rgba(255,255,255,0.15)');
    reflection.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = reflection;
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.1, horizon);
    ctx.lineTo(cx + width * 0.1, horizon);
    ctx.lineTo(cx + width * 0.22, height);
    ctx.lineTo(cx - width * 0.22, height);
    ctx.closePath();
    ctx.fill();
    for (let ember = 0; ember < 70; ember += 1) {
      const x = random() * width;
      const y = height * (0.15 + random() * 0.68);
      ctx.fillStyle = ember % 4 === 0 ? colors.light : colors.accent;
      ctx.globalAlpha = 0.12 + random() * 0.42;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + random() * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const MOTIF_DRAW = [shotIdea, shotMontage, shotImage, shotSound, shotStudio, shotRevelation];

  function renderShot(ctx, options) {
    const opts = options || {};
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const colors = palette(opts.style);
    const index = clamp(opts.index || 0, 0, 5);
    const random = mulberry32(hashString(`${opts.seedText || opts.subject || 'revelation'}|${opts.style || 'ambre'}|${index}|${opts.seed || 0}`));
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    baseGradient(ctx, width, height, colors.background);
    MOTIF_DRAW[index](ctx, width, height, colors, random);
    softFrame(ctx, width, height, colors.accent);
    vignette(ctx, width, height, 0.58);
    grain(ctx, width, height, random);
    ctx.restore();
  }

  function drawSpacedText(ctx, text, x, y, spacing) {
    let cursor = x;
    for (const char of String(text)) {
      ctx.fillText(char, cursor, y);
      cursor += ctx.measureText(char).width + spacing;
    }
    return cursor - spacing - x;
  }

  function fitFont(ctx, text, maxWidth, weight, family, startSize, minSize) {
    let size = startSize;
    do {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= Math.max(1, Math.round(startSize * 0.02));
    } while (size > minSize);
    return size;
  }

  function renderOverlay(ctx, options) {
    const opts = options || {};
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const colors = palette(opts.style);
    const shot = opts.shot || { index: 0, number: 1, title: 'UNE IDÉE', subtitle: 'Tout commence par une idée.' };
    const total = opts.total || 6;
    const index = Number(shot.index) || 0;
    const edge = index === 0 || index === total - 1;
    const serif = 'Georgia, "Times New Roman", serif';
    const sans = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const shade = ctx.createLinearGradient(0, height * 0.48, 0, height);
    shade.addColorStop(0, 'rgba(4,5,8,0)');
    shade.addColorStop(0.62, 'rgba(4,5,8,0.3)');
    shade.addColorStop(1, 'rgba(4,5,8,0.78)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, height * 0.48, width, height * 0.52);
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = Math.round(height * 0.018);
    const kicker = `RÉVÉLATION STUDIO · ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    if (edge) {
      ctx.textAlign = 'center';
      ctx.fillStyle = colors.accent;
      ctx.font = `600 ${Math.round(height * 0.017)}px ${sans}`;
      drawSpacedText(ctx, kicker, width * 0.5 - measureSpaced(ctx, kicker, height * 0.0045) / 2, height * (index === 0 ? 0.29 : 0.385), height * 0.0045);
      const titleSize = fitFont(ctx, shot.title, width * 0.82, '600', serif, Math.round(height * 0.135), Math.round(height * 0.06));
      ctx.font = `600 ${titleSize}px ${serif}`;
      ctx.fillStyle = colors.ink;
      ctx.fillText(shot.title, width * 0.5, height * (index === 0 ? 0.5 : 0.53));
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = Math.max(1, width / 620);
      ctx.beginPath();
      ctx.moveTo(width * 0.5 - width * 0.045, height * (index === 0 ? 0.56 : 0.59));
      ctx.lineTo(width * 0.5 + width * 0.045, height * (index === 0 ? 0.56 : 0.59));
      ctx.stroke();
      const subtitleSize = fitFont(ctx, shot.subtitle, width * 0.7, '400', sans, Math.round(height * 0.032), Math.round(height * 0.018));
      ctx.font = `400 ${subtitleSize}px ${sans}`;
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.92;
      ctx.fillText(shot.subtitle, width * 0.5, height * (index === 0 ? 0.63 : 0.66));
      ctx.globalAlpha = 1;
      if (index === total - 1 && opts.signature) {
        ctx.font = `400 ${Math.round(height * 0.021)}px ${sans}`;
        ctx.fillStyle = colors.accent;
        ctx.fillText(opts.signature, width * 0.5, height * 0.73);
      }
      if (index === 0 && opts.subject) {
        ctx.font = `500 ${Math.round(height * 0.022)}px ${sans}`;
        ctx.fillStyle = colors.ink;
        ctx.globalAlpha = 0.8;
        ctx.fillText(opts.subject.toUpperCase(), width * 0.5, height * 0.2);
        ctx.globalAlpha = 1;
      }
    } else {
      const x = width * 0.082;
      const base = height * 0.775;
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.accent;
      ctx.font = `600 ${Math.round(height * 0.015)}px ${sans}`;
      drawSpacedText(ctx, kicker, x, base - height * 0.155, height * 0.004);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x, base - height * 0.132, width * 0.03, Math.max(2, height * 0.0035));
      const titleSize = fitFont(ctx, shot.title, width * 0.8, '600', serif, Math.round(height * 0.075), Math.round(height * 0.038));
      ctx.font = `600 ${titleSize}px ${serif}`;
      ctx.fillStyle = colors.ink;
      ctx.fillText(shot.title, x, base - height * 0.045);
      const subtitleSize = fitFont(ctx, shot.subtitle, width * 0.78, '400', sans, Math.round(height * 0.027), Math.round(height * 0.016));
      ctx.font = `400 ${subtitleSize}px ${sans}`;
      ctx.fillStyle = colors.ink;
      ctx.globalAlpha = 0.9;
      ctx.fillText(shot.subtitle, x, base);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.24;
      ctx.font = `600 ${Math.round(height * 0.17)}px ${serif}`;
      ctx.fillText(String(index + 1).padStart(2, '0'), width * 0.94, height * 0.8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function measureSpaced(ctx, text, spacing) {
    let width = 0;
    for (const char of String(text)) width += ctx.measureText(char).width + spacing;
    return Math.max(0, width - spacing);
  }

  /* ------------------------------------------------------------------- music */

  const CHORDS = [
    [220.00, 261.63, 329.63],
    [174.61, 220.00, 261.63],
    [261.63, 329.63, 392.00],
    [196.00, 246.94, 293.66]
  ];
  const TRANSPOSE = { ambre: 1, acier: 1.0595, nuit: 0.9439, neon: 1.0293 };

  function addPluck(left, right, sampleRate, start, length, frequency, amplitude, pan) {
    const first = Math.max(0, Math.round(start * sampleRate));
    const count = Math.max(1, Math.round(length * sampleRate));
    const leftGain = amplitude * Math.sqrt(1 - pan);
    const rightGain = amplitude * Math.sqrt(pan);
    for (let offset = 0; offset < count; offset += 1) {
      const index = first + offset;
      if (index >= left.length) break;
      const local = offset / sampleRate;
      const attack = Math.min(1, local / 0.006);
      const envelope = attack * Math.exp(-6.4 * local);
      const value = (Math.sin(2 * Math.PI * frequency * local)
        + 0.34 * Math.sin(4 * Math.PI * frequency * local)
        + 0.16 * Math.sin(6 * Math.PI * frequency * local)) * envelope;
      left[index] += value * leftGain;
      right[index] += value * rightGain;
    }
  }

  function addImpact(left, right, sampleRate, start, amplitude) {
    const first = Math.max(0, Math.round(start * sampleRate));
    const count = Math.round(1.6 * sampleRate);
    for (let offset = 0; offset < count; offset += 1) {
      const index = first + offset;
      if (index >= left.length) break;
      const local = offset / sampleRate;
      const sweep = 52 * local - 7 * local * local;
      const value = Math.sin(2 * Math.PI * sweep) * Math.exp(-4.6 * local) * amplitude;
      left[index] += value;
      right[index] += value * 0.94;
    }
  }

  function addRiser(left, right, sampleRate, start, length, random) {
    const first = Math.max(0, Math.round(start * sampleRate));
    const count = Math.max(1, Math.round(length * sampleRate));
    let lowLeft = 0;
    let lowRight = 0;
    for (let offset = 0; offset < count; offset += 1) {
      const index = first + offset;
      if (index >= left.length) break;
      const progress = offset / count;
      const noiseLeft = random() * 2 - 1;
      const noiseRight = random() * 2 - 1;
      lowLeft = lowLeft * 0.86 + noiseLeft * 0.14;
      lowRight = lowRight * 0.86 + noiseRight * 0.14;
      const envelope = Math.pow(progress, 2.4) * 0.12;
      left[index] += lowLeft * envelope;
      right[index] += lowRight * envelope;
    }
  }

  function renderMusic(options) {
    const opts = options || {};
    const duration = clamp(opts.duration || 30, 6, 180);
    const sampleRate = Number(opts.sampleRate) === 44100 ? 44100 : 48000;
    const style = STYLES[opts.style] ? opts.style : 'ambre';
    const transpose = TRANSPOSE[style] || 1;
    const frames = Math.round(duration * sampleRate);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    const random = mulberry32(hashString(`${opts.seedText || 'revelation'}|music|${style}`));
    const chordLength = duration / 12;
    const barLength = chordLength / 4;
    const chordAt = (time) => {
      const chord = CHORDS[Math.floor(time / chordLength) % CHORDS.length];
      return chord.map((frequency) => frequency * transpose);
    };

    for (let index = 0; index < frames; index += 1) {
      const time = index / sampleRate;
      const local = time % chordLength;
      const notes = chordAt(time);
      const envelope = Math.min(1, local / 0.9) * Math.min(1, (chordLength - local) / 0.9);
      let pad = 0;
      for (let note = 0; note < notes.length; note += 1) {
        const frequency = notes[note];
        pad += Math.sin(2 * Math.PI * frequency * time) * 0.6
          + Math.sin(2 * Math.PI * frequency * 1.5 * time + 0.4) * 0.18;
      }
      const padLeft = pad * 0.019 * envelope;
      const padRight = (Math.sin(2 * Math.PI * notes[0] * 1.003 * time) * 0.6
        + Math.sin(2 * Math.PI * notes[1] * 0.997 * time + 0.7) * 0.6
        + Math.sin(2 * Math.PI * notes[2] * 1.004 * time + 1.1) * 0.6) * 0.019 * envelope;
      const beat = time % barLength;
      const bassEnvelope = Math.min(1, beat / 0.012) * Math.exp(-3.8 * beat);
      const bass = Math.sin(2 * Math.PI * (notes[0] / 2) * time) * 0.115 * bassEnvelope;
      const shimmerEnvelope = Math.max(0, Math.sin((time / duration) * Math.PI)) * 0.006;
      const shimmer = Math.sin(2 * Math.PI * notes[2] * 4 * time + Math.sin(time * 0.7)) * shimmerEnvelope;
      left[index] += padLeft + bass + shimmer;
      right[index] += padRight + bass * 0.96 + shimmer * 0.8;
    }

    const step = chordLength / 2;
    const steps = Math.ceil(duration / step);
    for (let index = 0; index < steps; index += 1) {
      const start = index * step;
      if (start >= duration) break;
      const notes = chordAt(start);
      const frequency = notes[index % notes.length] * (index % 8 === 7 ? 2 : 1);
      addPluck(left, right, sampleRate, start, Math.min(0.52, duration - start), frequency, 0.042, index % 2 ? 0.72 : 0.28);
    }

    addImpact(left, right, sampleRate, 0, 0.2);
    for (let section = 1; section < Math.min(4, Math.ceil(duration / 10)); section += 1) {
      const at = section * 10;
      if (at < duration) addImpact(left, right, sampleRate, at, 0.14);
      if (at - 1.8 > 0) addRiser(left, right, sampleRate, at - 1.8, 1.8, random);
    }

    let peak = 0;
    for (let index = 0; index < frames; index += 1) {
      const time = index / sampleRate;
      const fade = Math.min(1, time / 1.4) * Math.min(1, (duration - time) / 3.2);
      left[index] = Math.tanh(left[index] * fade * 1.15);
      right[index] = Math.tanh(right[index] * fade * 1.15);
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    }
    if (peak > 0.86) {
      const scale = 0.86 / peak;
      for (let index = 0; index < frames; index += 1) {
        left[index] *= scale;
        right[index] *= scale;
      }
    }
    return { left, right, sampleRate, duration: frames / sampleRate };
  }

  function encodeWav(audio) {
    const left = audio.left;
    const right = audio.right;
    const sampleRate = audio.sampleRate || 48000;
    const frames = Math.min(left.length, right.length);
    const buffer = new ArrayBuffer(44 + frames * 4);
    const view = new DataView(buffer);
    const write = (offset, text) => {
      for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + frames * 4, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, frames * 4, true);
    for (let index = 0; index < frames; index += 1) {
      const l = Math.max(-1, Math.min(1, left[index]));
      const r = Math.max(-1, Math.min(1, right[index]));
      view.setInt16(44 + index * 4, Math.round(l * 32767), true);
      view.setInt16(46 + index * 4, Math.round(r * 32767), true);
    }
    return new Uint8Array(buffer);
  }

  /* --------------------------------------------------------------- system TTS */

  function base64ToBytes(base64) {
    const binary = atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function ttsStatus() {
    if (root.StudioDesktop && typeof root.StudioDesktop.ttsVoices === 'function') {
      try {
        const status = await root.StudioDesktop.ttsVoices();
        if (status && !status.error) return { ...status, channel: 'desktop' };
        return { available: false, voices: [], reason: status && status.error ? status.error : 'Voix système indisponible.' };
      } catch (error) {
        return { available: false, voices: [], reason: error.message };
      }
    }
    const token = typeof root.StudioAuthToken === 'function' ? root.StudioAuthToken() : '';
    try {
      const response = await fetch('/api/tts/system/voices', { headers: token ? { 'X-Studio-Token': token } : {} });
      if (!response.ok) throw new Error('Le serveur local ne propose pas la synthèse vocale.');
      const status = await response.json();
      return { ...status, channel: 'serveur' };
    } catch (error) {
      return {
        available: false,
        voices: [],
        reason: 'Voix système disponible dans l’application macOS/Windows ou dans le Studio local. Cette édition web peut générer les images, les titres et la musique.'
      };
    }
  }

  async function ttsRender(payload) {
    const request = {
      text: String(payload && payload.text || '').slice(0, 900),
      voice: String(payload && payload.voice || '').slice(0, 80),
      rate: Math.round(clamp(payload && payload.rate || 175, 90, 320))
    };
    if (root.StudioDesktop && typeof root.StudioDesktop.ttsRender === 'function') {
      const result = await root.StudioDesktop.ttsRender(request);
      if (!result || result.error) throw new Error(result && result.error ? result.error : 'Synthèse vocale impossible.');
      return { bytes: base64ToBytes(result.data), mime: result.mime || 'audio/wav', voice: result.voice || request.voice };
    }
    const token = typeof root.StudioAuthToken === 'function' ? root.StudioAuthToken() : '';
    const response = await fetch('/api/tts/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Studio-Token': token } : {}) },
      body: JSON.stringify(request)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Synthèse vocale indisponible.');
    return { bytes: base64ToBytes(data.data), mime: data.mime || 'audio/wav', voice: data.voice || request.voice };
  }

  return {
    STYLES,
    DEFAULT_LINES,
    buildPlan,
    renderShot,
    renderOverlay,
    renderMusic,
    encodeWav,
    ttsStatus,
    ttsRender,
    hashString,
    mulberry32
  };
});
