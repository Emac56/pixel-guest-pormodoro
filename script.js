(function () {
'use strict';
var KEY = 'pixelQuestPomodoro.v1';
var $ = function (id) { return document.getElementById(id); };
function num(v, min, max, d) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(max, Math.max(min, v)) : d; }

/* ---------- Achievements ---------- */
var ACH = [
  { id: 'first', name: 'First Quest', desc: 'Complete your first focus session', ok: function (p) { return p.sessions >= 1; } },
  { id: 'app', name: 'Coding Apprentice', desc: 'Complete 5 focus sessions', ok: function (p) { return p.sessions >= 5; } },
  { id: 'war', name: 'Focus Warrior', desc: 'Complete 10 focus sessions', ok: function (p) { return p.sessions >= 10; } },
  { id: 'owl', name: 'Night Owl', desc: 'Complete a session in the evening (6 PM+)', ok: function () { return new Date().getHours() >= 18; } }
];

/* ---------- Save / load (safe against bad data) ---------- */
function load() {
  var s;
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
  var a = s.settings || {}, r = s.reward || {}, p = s.player || {}, q = s.quest || {};
  return {
    settings: { focus: num(a.focus, 1, 180, 25), short: num(a.short, 1, 60, 5), long: num(a.long, 1, 120, 15), every: num(a.every, 1, 12, 4) },
    reward: { name: typeof r.name === 'string' ? r.name.slice(0, 40) : 'Play guitar', mins: num(r.mins, 1, 120, 10), desc: typeof r.desc === 'string' ? r.desc.slice(0, 100) : '' },
    player: { xp: num(p.xp, 0, 1e9, 0), coins: num(p.coins, 0, 1e9, 0), sessions: num(p.sessions, 0, 1e9, 0), ach: Array.isArray(p.ach) ? p.ach.filter(function (x) { return typeof x === 'string'; }) : [] },
    quest: { text: typeof q.text === 'string' ? q.text.slice(0, 60) : '', done: q.done === true },
    muted: s.muted === true
  };
}
var S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- Popup notifications (service worker on Android, plain Notification elsewhere) ---------- */
var swReg = null, warned = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }).catch(function () {});
}
function askNotify() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission();
  else if (Notification.permission === 'denied' && !warned) { warned = true; toast('Notifications blocked - allow them in browser site settings'); }
}
function notify(title, body) {
  try { if (navigator.vibrate && !S.muted) navigator.vibrate([200, 100, 200]); } catch (e) {}
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  var opts = { body: body, tag: 'pixel-quest', renotify: true };
  function plain() { try { new Notification(title, opts); } catch (e) {} }
  if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(plain); else plain();
}

/* ---------- Levels: LV n needs 50*n*(n-1) total XP ---------- */
function need(l) { return 50 * l * (l - 1); }
function lvlOf(xp) { var l = 1; while (xp >= need(l + 1)) l++; return l; }

/* ---------- Sound (square-wave beeps; fails silently) ---------- */
var ac;
function beep(notes) {
  if (S.muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.resume) ac.resume();
    var t = ac.currentTime;
    notes.forEach(function (f, i) {
      var o = ac.createOscillator(), g = ac.createGain(), st = t + i * 0.13;
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.08, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
      o.connect(g); g.connect(ac.destination); o.start(st); o.stop(st + 0.13);
    });
  } catch (e) {}
}

/* ---------- Toasts (queued) ---------- */
var tq = [], tb = 0;
function toast(m) { tq.push(m); if (!tb) nextToast(); }
function nextToast() {
  var m = tq.shift(), t = $('toast');
  if (!m) { tb = 0; t.hidden = true; return; }
  tb = 1; t.textContent = m; t.hidden = false; setTimeout(nextToast, 2600);
}

/* ---------- Timer state (uses end timestamp, so tab switching stays accurate) ---------- */
var mode = 'focus';      // focus | break | reward
var status = 'idle';     // idle | run | pause | victory
var brkLong = false, end = 0, left = 0, total = 0, prog = 0, fr = 0, lastGain = [0, 0];
function dur(m) { return (m === 'focus' ? S.settings.focus : m === 'break' ? (brkLong ? S.settings.long : S.settings.short) : S.reward.mins) * 60000; }
left = total = dur('focus');

function start() { total = left = dur(mode); end = Date.now() + left; status = 'run'; render(); }
function pause() { left = end - Date.now(); status = 'pause'; render(); }
function resume() { end = Date.now() + left; status = 'run'; render(); }
function reset() { mode = 'focus'; status = 'idle'; left = total = dur('focus'); render(); }

function award() {
  var p = S.player, f = S.settings.focus, xp = f * 2, c = Math.max(1, Math.round(f / 5)), before = lvlOf(p.xp);
  p.xp += xp; p.coins += c; p.sessions++; lastGain = [xp, c];
  if (S.quest.text) S.quest.done = true;
  if (lvlOf(p.xp) > before) { toast('LEVEL UP! You are now LV ' + lvlOf(p.xp)); setTimeout(function () { beep([392, 523, 659, 784, 1047]); }, 1000); }
  ACH.forEach(function (a) {
    if (p.ach.indexOf(a.id) < 0 && a.ok(p)) { p.ach.push(a.id); toast('🏆 ' + a.name); }
  });
  save();
}

function finishReward() {
  brkLong = S.player.sessions % S.settings.every === 0;
  mode = 'break'; status = 'idle'; left = total = dur('break');
  beep([784, 659, 523]);
  toast('Reward over! Time for a ' + (brkLong ? 'long' : 'short') + ' break.');
  render();
}

function complete() {
  if (mode === 'focus') {
    award();
    mode = 'reward'; status = 'victory'; left = total = dur('reward');
    $('vQuest').textContent = S.quest.text ? 'Quest: ' + S.quest.text : 'Focus session finished!';
    $('vGain').textContent = '+' + lastGain[0] + ' XP   +' + lastGain[1] + ' COINS';
    $('vReward').textContent = (S.reward.name || 'Free time') + ' (' + S.reward.mins + ' min)' + (S.reward.desc ? ' - ' + S.reward.desc : '');
    $('victory').hidden = false;
    beep([523, 659, 784, 1047, 784, 1047]);
    notify('⚔ Quest complete!', 'Claim your reward: ' + (S.reward.name || 'Free time'));
  } else if (mode === 'reward') {
    notify('🎁 Reward time is up!', 'Back to the quest when you are ready.');
    finishReward(); return;
  } else {
    mode = 'focus'; status = 'idle'; left = total = dur('focus');
    beep([784, 659, 523]); toast('Break over! Ready for the next quest?');
    notify('⏰ Break over!', 'Ready for the next quest?');
  }
  render();
}

function tick() {
  if (status !== 'run') return;
  left = end - Date.now();
  if (left <= 0) { left = 0; complete(); return; }
  render();
}

/* ---------- Render ---------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function render() {
  var p = S.player, L = lvlOf(p.xp), a = need(L), b = need(L + 1), q = S.quest, secs = Math.ceil(left / 1000);
  var t = pad(Math.floor(secs / 60)) + ':' + pad(secs % 60), e = total ? 1 - left / total : 0;
  prog = mode === 'focus' ? e : (mode === 'reward' ? 1 : 0);
  $('lvl').textContent = L; $('coins').textContent = p.coins; $('sessions').textContent = p.sessions;
  $('xpFill').style.width = ((p.xp - a) / (b - a) * 100) + '%';
  $('xpTxt').textContent = 'XP ' + p.xp + ' / ' + b;
  $('mute').textContent = S.muted ? 'SND OFF' : 'SND ON';
  $('questLine').textContent = !q.text ? 'No quest yet - enter one below!' : q.done ? '★ ' + q.text + ' - COMPLETE!' : '▶ ' + q.text;
  $('questBtn').textContent = q.done ? 'NEW QUEST' : 'SET';
  $('questIn').hidden = q.done;
  $('time').textContent = t; $('fill').style.width = (e * 100) + '%';
  $('modeLbl').textContent = { focus: 'FOCUS MODE', 'break': 'BREAK MODE', reward: 'REWARD MODE' }[mode];
  $('bStart').hidden = status !== 'idle';
  $('bPause').hidden = status !== 'run';
  $('bResume').hidden = status !== 'pause';
  $('bFinish').hidden = !(mode === 'reward' && (status === 'run' || status === 'pause'));
  $('bReset').hidden = mode === 'reward';
  $('ach').innerHTML = '';
  ACH.forEach(function (x) {
    var li = document.createElement('li'), on = p.ach.indexOf(x.id) >= 0;
    li.className = on ? 'on' : ''; li.textContent = (on ? '🏆 ' : '🔒 ') + x.name + ' - ' + x.desc;
    $('ach').appendChild(li);
  });
  document.title = (status === 'run' ? t + ' - ' : '') + 'Pixel Quest Pomodoro';
}

/* ---------- Pixel world (drawn on canvas, no image files needed) ---------- */
var cx = $('world').getContext('2d');
var HERO = ['..rrrr..', '.rrrrrr.', '.ssssss.', '.skssks.', '..ssss..', '.gggggg.', 'sggggggw', '.gggggg.'];
var LEGS = [['.dd..dd.', '.dd..dd.'], ['..dddd..', '..d..d..']];
var HPAL = { r: '#ff004d', s: '#ffccaa', k: '#000', g: '#00a83a', w: '#fff', d: '#5f3a1e' };
var TREE = ['..lll..', '.lllll.', 'lllllll', '.lllll.', 'lllllll', '..lll..', '...t...', '...t...', '...t...'];
var TPAL = { l: '#00872b', t: '#7a4a21' };
function spr(rows, pal, x, y) {
  rows.forEach(function (r, j) {
    for (var i = 0; i < r.length; i++) { var c = pal[r[i]]; if (c) { cx.fillStyle = c; cx.fillRect(x + i, y + j, 1, 1); } }
  });
}
function rect(c, x, y, w, h) { cx.fillStyle = c; cx.fillRect(x, y, w, h); }
function draw() {
  var night = new Date().getHours() >= 18 || new Date().getHours() < 6;
  rect(night ? '#1a1c4b' : '#3b9cff', 0, 0, 160, 60);
  rect(night ? '#2b2f7a' : '#73c2ff', 0, 26, 160, 22);
  if (night) [[10, 6], [34, 12], [70, 4], [100, 10], [130, 5], [150, 16]].forEach(function (s) { rect('#fff', s[0], s[1], 1, 1); });
  var cxp = Math.floor(Date.now() / 400) % 200 - 30;
  rect(night ? '#5a5f9a' : '#fff', cxp, 8, 14, 3); rect(night ? '#5a5f9a' : '#fff', cxp + 3, 6, 8, 2);
  rect('#2a8f4a', 20, 42, 50, 6); rect('#2a8f4a', 100, 40, 40, 8);
  rect('#38b764', 0, 48, 160, 3); rect('#7a4a21', 0, 51, 160, 9);
  [12, 52, 96, 138].forEach(function (x) { spr(TREE, TPAL, x, 39); });
  var f = status === 'run' ? fr : 0, hx = Math.round(6 + prog * 140);
  spr(HERO.concat(LEGS[f]), HPAL, hx, 38);
}

/* ---------- Wire up controls ---------- */
$('bStart').onclick = function () { beep([440]); askNotify(); start(); };
$('bPause').onclick = pause;
$('bResume').onclick = resume;
$('bReset').onclick = reset;
$('bFinish').onclick = finishReward;
$('bClaim').onclick = function () { $('victory').hidden = true; beep([659, 784]); start(); };
$('mute').onclick = function () { S.muted = !S.muted; save(); render(); beep([440]); };

function setQuest() {
  if (S.quest.done) { S.quest = { text: '', done: false }; $('questIn').value = ''; render(); $('questIn').focus(); }
  else { S.quest = { text: $('questIn').value.trim(), done: false }; }
  save(); render();
}
$('questBtn').onclick = setQuest;
$('questIn').value = S.quest.text;
$('questIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') setQuest(); });

var fields = { sFocus: ['settings', 'focus', 1, 180], sShort: ['settings', 'short', 1, 60], sLong: ['settings', 'long', 1, 120], sEvery: ['settings', 'every', 1, 12], rMins: ['reward', 'mins', 1, 120] };
Object.keys(fields).forEach(function (id) {
  var f = fields[id], el = $(id);
  el.value = S[f[0]][f[1]];
  el.addEventListener('change', function () {
    S[f[0]][f[1]] = num(el.value, f[2], f[3], S[f[0]][f[1]]);
    el.value = S[f[0]][f[1]]; save();
    if (status === 'idle') left = total = dur(mode);
    render();
  });
});
$('rName').value = S.reward.name; $('rDesc').value = S.reward.desc;
$('rName').addEventListener('input', function () { S.reward.name = this.value; save(); });
$('rDesc').addEventListener('input', function () { S.reward.desc = this.value; save(); });

setInterval(tick, 250);
setInterval(function () { fr = fr ? 0 : 1; draw(); }, 500);
document.addEventListener('visibilitychange', tick);
render(); draw();
})();
