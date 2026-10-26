'use strict';

/* ---------------------------------------------------------------
 * Demo: a sample Atom session. The tab title shows the status mark
 * from .pi/extensions/atom-title.ts, and the guard asks before a
 * push to main, as in .pi/extensions/atom-guard.ts.
 * ------------------------------------------------------------- */
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const term = document.getElementById('term');
const mark = document.getElementById('title-mark');
const stateLabel = document.querySelector('#stage-state b');
let run = 0;            // bumps on every new take, so older timelines stop
let spin = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStatus(status) {
  clearInterval(spin);
  stage.classList.toggle('working', status === 'working');
  stage.classList.toggle('asking', status === 'asking');
  const labels = { idle: 'Idle', working: 'Working', asking: 'Waiting for you', done: 'Done' };
  stateLabel.textContent = labels[status];
  if (status === 'working' && !reduceMotion) {
    let frame = 0;
    spin = setInterval(() => { mark.textContent = SPINNER[frame++ % SPINNER.length]; }, 120);
  } else {
    mark.textContent = { idle: '○', working: '⠋', asking: '⠿', done: '✓' }[status];
  }
}

function line(cls, text) {
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  term.appendChild(p);
  return p;
}

async function type(cls, text, id) {
  const p = line(cls, '');
  for (const ch of text) {
    p.textContent += ch;
    await sleep(reduceMotion ? 0 : 18 + Math.random() * 30);
    if (id !== run) return false;
  }
  return true;
}

// The guard: resolves with true (run it) or false (declined).
function ask(command, id) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'guard';
    box.innerHTML = '<p class="guard-h">Atom guard: push to main or master</p><p class="guard-cmd"></p>' +
      '<div class="guard-actions"><button type="button" data-a="no">No</button><button type="button" data-a="yes">Yes</button></div>';
    box.querySelector('.guard-cmd').textContent = command + '  Run it?';
    term.appendChild(box);
    const buttons = [...box.querySelectorAll('button')];
    const choose = (answer) => {
      if (id !== run) return;
      buttons.forEach((b) => { b.disabled = true; b.classList.toggle('picked', b.dataset.a === answer); });
      resolve(answer === 'yes');
    };
    buttons.forEach((b) => b.addEventListener('click', () => choose(b.dataset.a)));
    // Nobody clicked: decline on their behalf, as a careful user would.
    setTimeout(() => choose('no'), reduceMotion ? 0 : 3400);
  });
}

async function session() {
  const id = ++run;
  while (id === run) {
    term.innerHTML = '';
    setStatus('idle');
    await sleep(900);
    if (id !== run) return;
    if (!await type('you', 'The date parser fails on 29 Feb. Fix it and ship it.', id)) return;
    await sleep(500);
    setStatus('working');
    await sleep(1100);
    if (id !== run) return;
    line('model', 'The parser builds the date before it knows the year, so 29 Feb is rejected as invalid. I will read the year first, then validate the day against it.');
    await sleep(1500);
    if (id !== run) return;
    line('cmd', 'npm test');
    await sleep(900);
    if (id !== run) return;
    line('ok', '✓ 42 passed');
    await sleep(800);
    if (id !== run) return;
    line('model', 'Fixed and tested. Pushing it now.');
    await sleep(700);
    if (id !== run) return;
    setStatus('asking');
    const yes = await ask('git push origin main', id);
    if (id !== run) return;
    await sleep(500);
    if (yes) {
      setStatus('working');
      line('cmd', 'git push origin main');
      await sleep(900);
      if (id !== run) return;
      line('model', 'Pushed to main.');
    } else {
      line('muted', 'Blocked: you declined "push to main or master".');
      await sleep(700);
      if (id !== run) return;
      line('model', 'Understood, I have not pushed. The fix is committed locally. Should I push it to a new branch and open a pull request instead?');
    }
    setStatus('done');
    await sleep(6000);
  }
}

/* ---------------------------------------------------------------
 * Copy the agent setup prompt
 * ------------------------------------------------------------- */
async function copyPrompt(button) {
  const text = document.getElementById('prompt-text').textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  const label = button.querySelector('[data-copy-label]');
  const original = label.textContent;
  button.classList.add('copied');
  label.textContent = 'Copied — paste it into your agent';
  setTimeout(() => { button.classList.remove('copied'); label.textContent = original; }, 2400);
}

document.querySelectorAll('[data-copy="prompt"]').forEach((button) => button.addEventListener('click', () => copyPrompt(button)));

session();
