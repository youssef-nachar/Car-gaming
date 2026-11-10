(() => {
  'use strict';
  const $ = s => document.querySelector(s), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch { } } };
  const joinBtn = $('#join-btn'), roomInput = $('#room-input'), nameInput = $('#name-input'), statusMsg = $('#status-msg');
  const joinScreen = $('#join-screen'), gamepad = $('#gamepad'), chip = $('#my-color'), lostEl = $('#lost');
  let lastLives = null, peer = null, conn = null, room = '', connected = false, wantLive = false, raf = 0, lastSent = '', lastSend = 0, wake = null, retryT = 0;
  const state = { steer: 0, throttle: 0, brake: 0, boost: 0, fire: 0 };
  const params = new URLSearchParams(location.search);
  roomInput.value = (params.get('room') || store.get('sr_room') || '').toUpperCase(); nameInput.value = store.get('sr_name') || '';
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms) } catch { } };
  const tx = m => { if (conn && conn.open) conn.send(m) };
  function status(t, c = '#aab3d0') { statusMsg.textContent = t; statusMsg.style.color = c }
  function fs() { try { const e = document.documentElement, f = e.requestFullscreen || e.webkitRequestFullscreen; if (f) { const r = f.call(e); if (r && r.catch) r.catch(() => { }) } const o = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (o && o.catch) o.catch(() => { }) } catch { } }
  function lockWake() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => wake = l).catch(() => { }) } catch { } }
  function fail(msg) { wantLive = false; connected = false; clearTimeout(retryT); document.body.classList.remove('playing'); gamepad.hidden = true; lostEl.hidden = true; joinScreen.hidden = false; joinBtn.disabled = false; joinBtn.textContent = 'TRY AGAIN'; status(msg, '#ff647c') }
  function connect() {
    room = roomInput.value.trim().toUpperCase();
    if (!room) return status('Enter a room code first.', '#ff8cda');
    store.set('sr_room', room); store.set('sr_name', nameInput.value.trim());
    joinBtn.disabled = true; joinBtn.textContent = 'CONNECTING…'; status('Finding your game…', '#ffcf65'); wantLive = true; fs();
    if (peer && !peer.destroyed && peer.open) return link();
    if (peer && !peer.destroyed) return;
    try { peer = new Peer(undefined, { debug: 0 }) } catch (e) { return fail('PeerJS could not start.') }
    peer.on('open', link);
    peer.on('disconnected', () => { if (wantLive && !peer.destroyed) setTimeout(() => { try { peer.reconnect() } catch { } }, 800) });
    peer.on('error', e => { if (e.type === 'peer-unavailable') return fail('Room not found. Check the code.'); if (!connected && wantLive) fail('Connection failed. Try again.') });
  }
  function link() {
    if (!wantLive || !peer || peer.destroyed || !peer.open) return;
    const c = conn = peer.connect(room, { reliable: true });
    c.on('open', () => status('Connected — assigning driver…', '#59f4ff'));
    c.on('data', onData);
    c.on('close', () => { if (c === conn) lost() });
    c.on('error', () => { if (c === conn) lost() });
  }
  function lost() {
    setCam(false); connected = false; state.steer = state.throttle = state.brake = state.boost = state.fire = 0;
    if (!wantLive) return;
    if (!gamepad.hidden) lostEl.hidden = false;
    clearTimeout(retryT); retryT = setTimeout(link, 1500);
  }
  function onData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'init') {
      connected = true; clearTimeout(retryT); joinScreen.hidden = true; gamepad.hidden = false; lostEl.hidden = true; document.body.classList.add('playing');
      chip.textContent = nameInput.value.trim() || d.name || 'DRIVER'; chip.style.color = chip.style.borderColor = d.color; document.documentElement.style.setProperty('--me', d.color);
      const n = nameInput.value.trim(); if (n) tx({ type: 'name', name: n });
      buzz(40); fs(); lockWake(); startLoop();
    }
    if (d.type === 'cam') setCam(!!d.on);
    if (d.type === 'frame' && d.buf && camOn) {
      const im = $('#cam-img'), old = im.src, u = URL.createObjectURL(new Blob([d.buf], { type: 'image/jpeg' }));
      im.onload = () => { if (old && old.startsWith('blob:')) URL.revokeObjectURL(old) };
      im.src = u; camWin.hidden = false;
    }
    if (d.type === 'full') fail('Room is full (8 drivers max).');
    if (d.type === 'tel') { if (typeof d.item === 'string') setItem(d.item); $('#spd').textContent = d.speed; $('#nitro-fill').style.width = clamp(d.boost, 0, 100) + '%'; if (typeof d.lives === 'number') { $('#lives').textContent = '♥'.repeat(d.lives) + '♡'.repeat(Math.max(0, 6 - d.lives)); if (lastLives !== null && d.lives < lastLives) buzz([140, 70, 140]); lastLives = d.lives } }
  }
  /* first-person road window */
  const camWin = $('#cam-win'); let camOn = false;
  function setCam(on) { camOn = on; if (!on) { camWin.hidden = true; const im = $('#cam-img'); if (im.src.startsWith('blob:')) URL.revokeObjectURL(im.src); im.removeAttribute('src') } }
  $('#cam-x').addEventListener('click', () => { setCam(false); tx({ type: 'camclose' }); buzz(12) });
  function send(force) {
    const n = performance.now(); if (!connected || !conn || !conn.open) return;
    const s = { steer: +state.steer.toFixed(3), throttle: state.throttle, brake: state.brake, boost: state.boost, fire: state.fire }, k = JSON.stringify(s);
    if (!force && ((k === lastSent && n - lastSend < 100) || n - lastSend < 30)) return;
    lastSent = k; lastSend = n;
    conn.send({ type: 'input', input: { ...s, accel: s.throttle > .05, left: s.steer < -.08, right: s.steer > .08 } });
  }
  function startLoop() { cancelAnimationFrame(raf); const loop = () => { send(); raf = requestAnimationFrame(loop) }; loop() }
  joinBtn.addEventListener('click', connect);
  [roomInput, nameInput].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') connect() }));

  /* steering wheel: drag around the centre, springs back on release */
  const wheel = $('#wheel'), wrot = $('#wheel-rot');
  const SENS = [['SOFT', 2.6], ['NORMAL', 1.9], ['SHARP', 1.3]];
  let sens = clamp(+(store.get('sr_sens') || 1), 0, 2), rot = 0, wp = null, wAng = 0, spring = 0;
  function setSens() { $('#btn-sens').textContent = 'STEERING: ' + SENS[sens][0] }
  function applyRot() { wrot.style.transform = `rotate(${rot}rad)`; const s = rot / SENS[sens][1]; state.steer = Math.abs(s) < .04 ? 0 : clamp(s, -1, 1) }
  const ang = e => { const r = wheel.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) };
  wheel.addEventListener('pointerdown', e => { if (wp !== null) return; e.preventDefault(); wp = e.pointerId; wheel.setPointerCapture(wp); wAng = ang(e); cancelAnimationFrame(spring); buzz(8) });
  wheel.addEventListener('pointermove', e => { if (e.pointerId !== wp) return; e.preventDefault(); const a = ang(e); let d = a - wAng; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; wAng = a; rot = clamp(rot + d, -SENS[sens][1], SENS[sens][1]); applyRot() });
  function back() { rot *= .8; if (Math.abs(rot) < .012) rot = 0; applyRot(); if (rot !== 0) spring = requestAnimationFrame(back); else send(true) }
  const rel = e => { if (e.pointerId !== wp) return; wp = null; spring = requestAnimationFrame(back) };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => wheel.addEventListener(t, rel));
  setSens();

  /* steering mode: WHEEL (small finger-sized wheel) or ARROWS (left / right buttons) */
  let mode = store.get('sr_mode') === 'arrows' ? 'arrows' : 'wheel', dirL = 0, dirR = 0;
  function setMode(m) {
    mode = m; store.set('sr_mode', m);
    document.body.classList.toggle('arrows', m === 'arrows');
    $('#btn-mode').textContent = 'STEER: ' + (m === 'arrows' ? 'ARROWS' : 'WHEEL');
    cancelAnimationFrame(spring); rot = 0; wrot.style.transform = ''; wp = null; dirL = dirR = 0; state.steer = 0;
    $('#btn-left').classList.remove('on'); $('#btn-right').classList.remove('on'); send(true);
  }
  function dirBtn(id, side) {
    const b = $(id); let pid = null;
    const set = v => { if (side < 0) dirL = v; else dirR = v; state.steer = dirR - dirL; b.classList.toggle('on', !!v); send(true) };
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (pid !== null) return; pid = e.pointerId; b.setPointerCapture(pid); buzz(10); set(1) });
    const up = e => { if (e.pointerId !== pid) return; pid = null; set(0) };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, up));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  dirBtn('#btn-left', -1); dirBtn('#btn-right', 1);
  $('#btn-mode').addEventListener('click', () => { setMode(mode === 'wheel' ? 'arrows' : 'wheel'); buzz(12) });
  setMode(mode);

  /* pedals: pointer capture so a sliding finger can never leave a pedal stuck */
  function hold(id, key, vib) {
    const b = $(id); let pid = null;
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (pid !== null) return; pid = e.pointerId; b.setPointerCapture(pid); state[key] = 1; b.classList.add('on'); buzz(vib); send(true) });
    const up = e => { if (e.pointerId !== pid) return; pid = null; state[key] = 0; b.classList.remove('on'); send(true) };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, up));
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  hold('#btn-accel', 'throttle', 10); hold('#btn-brake', 'brake', 10); hold('#btn-boost', 'boost', 30);

  /* FIRE: uses the item (missile / mine) picked up on the road. The signal is held ~170ms so a quick tap is never missed. */
  let lastItem = '';
  function setItem(t) { const f = $('#btn-fire'); f.classList.toggle('ready', !!t); $('#fire-ico').textContent = t === 'missile' ? '🚀' : t === 'mine' ? '💣' : '•'; if (t && t !== lastItem) buzz(30); lastItem = t }
  {
    const b = $('#btn-fire');
    b.addEventListener('pointerdown', e => { e.preventDefault(); state.fire = 1; b.classList.add('on'); buzz(25); send(true); clearTimeout(b._t); b._t = setTimeout(() => { state.fire = 0; send(true) }, 170) });
    const up = () => b.classList.remove('on');
    ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach(t => b.addEventListener(t, up));
    b.addEventListener('contextmenu', e => e.preventDefault())
  }

  $('#btn-view').addEventListener('click', () => { tx({ type: 'view' }); buzz(15) });
  $('#btn-pause').addEventListener('click', () => { tx({ type: 'pause' }); buzz(15) });
  $('#btn-sens').addEventListener('click', () => { sens = (sens + 1) % 3; store.set('sr_sens', sens); setSens(); rot = clamp(rot, -SENS[sens][1], SENS[sens][1]); applyRot(); buzz(12) });
  $('#btn-swap').addEventListener('click', () => { document.body.classList.toggle('lefty'); store.set('sr_lefty', document.body.classList.contains('lefty') ? '1' : '0'); buzz(12) });
  if (store.get('sr_lefty') === '1') document.body.classList.add('lefty');

  ['gesturestart', 'contextmenu'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { state.throttle = state.brake = state.boost = state.fire = 0; send(true) }
    else if (connected) lockWake();
  });
  addEventListener('pagehide', () => { wantLive = false; state.steer = state.throttle = state.brake = state.boost = state.fire = 0; send(true); try { if (conn) conn.close() } catch { } });
})();
