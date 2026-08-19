/*
  Oddgrid engine — renders text or an image onto a grid of animated dots.

      const grid = OddgridEngine(document.getElementById("host"), { words:["HELLO"] });
      grid.set({ wave:{ amp:0.6 } });

  The whole engine is one self-contained function on purpose: the studio exports a
  standalone embed by stringifying it, so it must not reference anything outside itself.
*/
(function(){
"use strict";

function OddgridEngine(host, opts){
  "use strict";

  var clamp = function(v,a,b){ return v < a ? a : v > b ? b : v; };
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var O = {
    mode:"text",
    words:["ODDGRID"],
    font:'"Archivo Black",Impact,sans-serif',
    image:null, read:"alpha", cut:0.14, gain:1, imgColour:false,
    fit:0.78, cell:11, dotScale:0.82, shape:"circle",
    colour:"#FFB020", bg:null,   // null leaves the canvas transparent
    interactive:true,
    morph:{ on:true, k:0.20, damp:0.76, scatter:70, cycle:2.5 },
    repel:{ on:true, r:170, f:70, lag:0.16 },
    wave:{ on:!reduced, amp:0.46, len:240, speed:0.34, angle:28 },
    onimage:null
  };

  function merge(target, patch){
    for (var k in patch){
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      var v = patch[k];
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])){
        merge(target[k], v);
      } else {
        target[k] = v;
      }
    }
  }
  merge(O, opts || {});

  var canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  var W = 0, H = 0, dpr = 1;
  var dots = [];
  var img = null, imgInfo = null;
  var wordIndex = 0, wordTimer = 0, time = 0, running = true;
  var pointer = { x:-9999, y:-9999, sx:-9999, sy:-9999, down:false, inside:false };

  /* ---------- sampling ----------
     Text or image is drawn into a canvas shrunk by one cell per pixel, so each
     pixel's value IS that cell's coverage. That number becomes the dot's weight. */
  var sampler = document.createElement("canvas");
  var sctx = sampler.getContext("2d", { willReadFrequently:true });

  function beginSample(){
    var cell = O.cell;
    var cols = Math.max(1, Math.floor(W / cell));
    var rows = Math.max(1, Math.floor(H / cell));
    sampler.width = cols; sampler.height = rows;
    sctx.setTransform(1,0,0,1,0,0);
    sctx.clearRect(0,0,cols,rows);
    sctx.setTransform(1/cell,0,0,1/cell,0,0);
    return { cols:cols, rows:rows, cell:cell };
  }

  function sampleText(){
    var s = beginSample();
    var word = O.words[wordIndex] || "";
    if (!word) return [];

    sctx.textAlign = "center";
    sctx.textBaseline = "middle";
    var probe = 100;
    sctx.font = probe + "px " + O.font;
    var m = sctx.measureText(word);
    var wProbe = Math.max(1, m.width);
    var hProbe = (m.actualBoundingBoxAscent || probe*0.72) + (m.actualBoundingBoxDescent || probe*0.2);
    var size = clamp(Math.min(probe * (W*O.fit) / wProbe, probe * (H*O.fit) / Math.max(1,hProbe)), 8, 4000);

    sctx.font = size + "px " + O.font;
    var m2 = sctx.measureText(word);
    var asc = m2.actualBoundingBoxAscent || size*0.72;
    var desc = m2.actualBoundingBoxDescent || size*0.2;
    sctx.fillStyle = "#fff";
    sctx.fillText(word, W/2, H/2 + (asc - desc)/2);

    var data = sctx.getImageData(0,0,s.cols,s.rows).data;
    var out = [];
    for (var r=0; r<s.rows; r++){
      for (var c=0; c<s.cols; c++){
        var a = data[(r*s.cols + c)*4 + 3] / 255;
        if (a > 0.32) out.push({ x:(c+0.5)*s.cell, y:(r+0.5)*s.cell, w:clamp(a*1.15,0,1), col:-1 });
      }
    }
    return out;
  }

  function sampleImage(){
    if (!img) return [];
    var s = beginSample();
    var iw = img.width, ih = img.height;
    var sc = Math.min((W*O.fit)/iw, (H*O.fit)/ih);
    var dw = iw*sc, dh = ih*sc;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, (W-dw)/2, (H-dh)/2, dw, dh);

    var data = sctx.getImageData(0,0,s.cols,s.rows).data;
    var out = [];
    var cut = O.cut, span = Math.max(0.02, 1 - cut), gamma = 1 / O.gain;

    for (var r=0; r<s.rows; r++){
      for (var c=0; c<s.cols; c++){
        var i = (r*s.cols + c)*4;
        var a = data[i+3] / 255;
        if (a < 0.02) continue;
        var R = data[i], G = data[i+1], B = data[i+2];
        var lum = (0.2126*R + 0.7152*G + 0.0722*B) / 255;

        var v = O.read === "alpha" ? a : O.read === "bright" ? a*lum : a*(1-lum);
        v = (v - cut) / span;
        if (v <= 0.04) continue;
        v = Math.pow(clamp(v,0,1), gamma);

        var col = -1;
        if (O.imgColour){
          // size already carries brightness, so normalise to keep the hue readable
          var k = 255 / (Math.max(R,G,B) || 1);
          col = ((Math.min(255,R*k|0) & 0xF0) << 16) | ((Math.min(255,G*k|0) & 0xF0) << 8) | (Math.min(255,B*k|0) & 0xF0);
        }
        out.push({ x:(c+0.5)*s.cell, y:(r+0.5)*s.cell, w:v, col:col });
      }
    }
    return out;
  }

  // A full-bleed image at the finest cell can ask for 40k dots, which drops the
  // frame rate below the point where the motion reads. Keep the strongest ones.
  var DOT_BUDGET = 24000;
  function trim(targets){
    if (targets.length <= DOT_BUDGET) return targets;
    targets.sort(function(a,b){ return b.w - a.w; });
    targets.length = DOT_BUDGET;
    return targets;
  }

  /* ---------- morph assignment ----------
     Every target claims the nearest unclaimed dot, so pixels two frames share
     stay put and only the difference travels. */
  function retarget(){
    var targets = trim(O.mode === "image" ? sampleImage() : sampleText());
    var bs = Math.max(O.cell * 3, 18);
    var buckets = new Map();
    var i, d;

    for (i=0; i<dots.length; i++){
      d = dots[i];
      d.taken = false;
      if (d.dying) continue;
      var key = ((d.x/bs)|0) + ":" + ((d.y/bs)|0);
      var b = buckets.get(key);
      if (!b) buckets.set(key, b = []);
      b.push(d);
    }

    function take(x,y){
      var bx = (x/bs)|0, by = (y/bs)|0;
      for (var ring=0; ring<=5; ring++){
        var best = null, bestD = Infinity, bestB = null, bestI = -1;
        for (var ox=-ring; ox<=ring; ox++){
          for (var oy=-ring; oy<=ring; oy++){
            if (ring > 0 && Math.abs(ox) !== ring && Math.abs(oy) !== ring) continue;
            var b = buckets.get((bx+ox) + ":" + (by+oy));
            if (!b) continue;
            for (var j=0; j<b.length; j++){
              var dd = (b[j].x-x)*(b[j].x-x) + (b[j].y-y)*(b[j].y-y);
              if (dd < bestD){ bestD = dd; best = b[j]; bestB = b; bestI = j; }
            }
          }
        }
        if (best){ bestB.splice(bestI,1); return best; }
      }
      return null;
    }

    var scatter = O.morph.on ? O.morph.scatter : 0;
    for (i=0; i<targets.length; i++){
      var t = targets[i];
      d = take(t.x, t.y);
      if (d){
        d.tx = t.x; d.ty = t.y; d.ts = t.w; d.pt = 1; d.col = t.col; d.taken = true; d.dying = false;
      } else {
        var ang = Math.random() * Math.PI * 2;
        var rad = scatter * (0.4 + Math.random() * 0.9);
        dots.push({
          x: t.x + Math.cos(ang)*rad, y: t.y + Math.sin(ang)*rad,
          vx:0, vy:0, s:0, ts:t.w, p:0, pt:1, tx:t.x, ty:t.y,
          col:t.col, taken:true, dying:false
        });
      }
    }

    for (i=0; i<dots.length; i++){
      d = dots[i];
      if (d.taken || d.dying) continue;
      d.dying = true; d.ts = 0; d.pt = 0;
      var a2 = Math.random() * Math.PI * 2;
      d.vx += Math.cos(a2) * scatter * 0.05;
      d.vy += Math.sin(a2) * scatter * 0.05;
    }

    if (!O.morph.on){
      for (i=dots.length-1; i>=0; i--){
        d = dots[i];
        if (d.dying){ dots.splice(i,1); continue; }
        d.x = d.tx; d.y = d.ty; d.vx = d.vy = 0; d.s = d.ts; d.p = d.pt;
      }
    }
  }

  /* ---------- physics ---------- */
  function step(dt){
    time += dt;

    if (O.mode === "text" && O.words.length > 1 && O.morph.cycle > 0){
      wordTimer += dt / 60;
      if (wordTimer >= O.morph.cycle){ wordTimer = 0; next(); }
    }

    pointer.sx += (pointer.x - pointer.sx) * O.repel.lag * dt;
    pointer.sy += (pointer.y - pointer.sy) * O.repel.lag * dt;

    var k = O.morph.on ? O.morph.k : 1;
    var damp = Math.pow(O.morph.damp, dt);
    var ease = clamp(0.16 * dt, 0, 1);

    for (var i=dots.length-1; i>=0; i--){
      var d = dots[i];
      d.vx = (d.vx + (d.tx - d.x) * k * dt) * damp;
      d.vy = (d.vy + (d.ty - d.y) * k * dt) * damp;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.s += (d.ts - d.s) * ease;
      d.p += (d.pt - d.p) * ease;
      if (d.dying && d.p < 0.02) dots.splice(i,1);
    }
  }

  /* ---------- drawing ----------
     One fill() per dot crawls at fine grids, so dots are bucketed by colour and by
     quantised opacity: each bucket is one globalAlpha, one fillStyle and one path.
     The canvas itself stays transparent unless a background is asked for. */
  var batch = new Map();
  var batchAge = 0;
  var batchColour = null;
  var GC = [255,176,32];

  function readHex(hex, into){
    into[0] = parseInt(hex.slice(1,3),16);
    into[1] = parseInt(hex.slice(3,5),16);
    into[2] = parseInt(hex.slice(5,7),16);
  }

  function paint(g, scale){
    readHex(O.colour, GC);
    // buckets cache their fill string, so a colour change has to void them
    if (O.colour !== batchColour){ batch.clear(); batchColour = O.colour; }

    g.setTransform(scale,0,0,scale,0,0);
    g.clearRect(0,0,W,H);
    if (O.bg){ g.fillStyle = O.bg; g.fillRect(0,0,W,H); }

    if (++batchAge > 240){ batch.clear(); batchAge = 0; }
    batch.forEach(function(b){ b.n = 0; });
    var lastKey = -1, lastB = null;

    var rOn = O.repel.on && O.interactive && pointer.inside;
    var rR = O.repel.r;
    var rF = O.repel.f * (pointer.down ? 2.1 : 1);
    var wOn = O.wave.on, amp = O.wave.amp;
    var wk = (Math.PI * 2) / O.wave.len;
    var wca = Math.cos(O.wave.angle * Math.PI/180);
    var wsa = Math.sin(O.wave.angle * Math.PI/180);
    var wPhase = time * O.wave.speed * 0.12;
    var base = O.cell * O.dotScale * 0.5;

    for (var i=0; i<dots.length; i++){
      var d = dots[i];
      var px = d.x, py = d.y;

      if (rOn){
        var ddx = px - pointer.sx, ddy = py - pointer.sy;
        var dist = Math.sqrt(ddx*ddx + ddy*ddy);
        if (dist < rR && dist > 0.001){
          var tt = 1 - dist / rR;
          var push = tt * tt * rF;
          px += (ddx / dist) * push;
          py += (ddy / dist) * push;
        }
      }

      var mul = 1, alpha = d.p;
      if (wOn && amp > 0){
        var w = Math.sin((d.x * wca + d.y * wsa) * wk - wPhase);
        mul = 1 + amp * w * 0.85;
        alpha *= clamp(1 + amp * w * 0.55, 0.12, 1);
        if (mul < 0) mul = 0;
      }

      var r = base * d.s * mul;
      if (r < 0.18 || alpha < 0.032) continue;

      var a = (alpha > 1 ? 1 : alpha) * 16 + 0.5 >> 0;   // 0..16
      var cr, cg, cb, key;
      if (d.col >= 0){
        cr = (d.col >> 16) & 255; cg = (d.col >> 8) & 255; cb = d.col & 255;
        key = ((((cr >> 4) << 8) | ((cg >> 4) << 4) | (cb >> 4)) << 5) | a;
      } else {
        cr = GC[0]; cg = GC[1]; cb = GC[2];
        key = (1 << 17) | a;   // the flat colour gets its own space, exact
      }

      var b;
      if (key === lastKey){ b = lastB; }
      else {
        b = batch.get(key);
        if (!b){
          b = { css:"rgb(" + cr + "," + cg + "," + cb + ")", alpha:a/16, d:[], n:0 };
          batch.set(key, b);
        }
        lastKey = key; lastB = b;
      }
      b.d[b.n++] = px; b.d[b.n++] = py; b.d[b.n++] = r;
    }

    var CHUNK = 2400, shape = O.shape;
    batch.forEach(function(b){
      if (!b.n) return;
      g.globalAlpha = b.alpha;
      g.fillStyle = b.css;
      for (var start=0; start<b.n; start += CHUNK*3){
        var end = Math.min(b.n, start + CHUNK*3);
        g.beginPath();
        for (var i=start; i<end; i+=3){
          var x = b.d[i], y = b.d[i+1], r = b.d[i+2];
          if (shape === "square"){
            g.rect(x-r, y-r, r*2, r*2);
          } else if (shape === "diamond"){
            g.moveTo(x, y-r); g.lineTo(x+r, y); g.lineTo(x, y+r); g.lineTo(x-r, y); g.closePath();
          } else {
            g.moveTo(x+r, y); g.arc(x, y, r, 0, Math.PI*2);
          }
        }
        g.fill();
      }
    });
    g.globalAlpha = 1;
  }

  /* ---------- loop ---------- */
  var last = performance.now();
  function frame(now){
    if (!running) return;
    var dt = clamp((now - last) / 16.6667, 0.2, 3);
    last = now;
    step(dt);
    paint(ctx, dpr);
    requestAnimationFrame(frame);
  }

  function resize(){
    var rect = host.getBoundingClientRect();
    var nw = Math.max(1, Math.round(rect.width));
    var nh = Math.max(1, Math.round(rect.height));
    if (nw === W && nh === H) return;
    W = nw; H = nh;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    retarget();
  }

  function next(){
    wordIndex = (wordIndex + 1) % Math.max(1, O.words.length);
    retarget();
  }

  function loadImage(src, done){
    if (!src){ img = null; imgInfo = null; if (done) done(null); return; }
    var im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = function(){
      var nw = im.naturalWidth || 1000, nh = im.naturalHeight || 1000;
      var cap = 1000, sc = Math.min(1, cap / Math.max(nw, nh));
      var buf = document.createElement("canvas");
      buf.width = Math.max(1, Math.round(nw*sc));
      buf.height = Math.max(1, Math.round(nh*sc));
      buf.getContext("2d").drawImage(im, 0, 0, buf.width, buf.height);
      img = buf;
      imgInfo = { width:nw, height:nh, buffer:buf, alpha:detectAlpha(buf) };
      O.image = src;
      retarget();
      if (O.onimage) O.onimage(imgInfo);
      if (done) done(imgInfo);
    };
    im.onerror = function(){ if (done) done(null); };
    im.src = src;
  }

  function detectAlpha(buf){
    var w = Math.min(buf.width, 160), h = Math.min(buf.height, 160);
    var t = document.createElement("canvas");
    t.width = w; t.height = h;
    var c = t.getContext("2d", { willReadFrequently:true });
    c.drawImage(buf, 0, 0, w, h);
    var d = c.getImageData(0,0,w,h).data;
    var clear = 0;
    for (var i=3; i<d.length; i+=4) if (d[i] < 24) clear++;
    return clear > (d.length/4) * 0.06;
  }

  /* ---------- pointer ---------- */
  canvas.addEventListener("pointermove", function(e){
    var r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    if (!pointer.inside){ pointer.sx = pointer.x; pointer.sy = pointer.y; pointer.inside = true; }
  });
  canvas.addEventListener("pointerleave", function(){ pointer.inside = false; pointer.down = false; });
  canvas.addEventListener("pointerdown", function(e){ pointer.down = true; canvas.setPointerCapture(e.pointerId); });
  window.addEventListener("pointerup", function(){ pointer.down = false; });

  var ro = new ResizeObserver(resize);
  ro.observe(host);

  if (O.image) loadImage(O.image);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ retarget(); });
  resize();
  requestAnimationFrame(frame);

  return {
    canvas: canvas,
    options: O,
    set: function(patch){
      var needs = false;
      for (var k in patch){
        if (k === "cell" || k === "fit" || k === "font" || k === "words" || k === "mode" ||
            k === "read" || k === "cut" || k === "gain" || k === "imgColour") needs = true;
      }
      merge(O, patch);
      if (needs) retarget();
    },
    setImage: loadImage,
    imageInfo: function(){ return imgInfo; },
    next: next,
    retarget: retarget,
    size: function(){ return { w:W, h:H }; },
    destroy: function(){ running = false; ro.disconnect(); canvas.remove(); }
  };
}

window.OddgridEngine = OddgridEngine;
})();
