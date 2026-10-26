'use strict';

/* ---------------------------------------------------------------
 * Demo: a sample Atom session. The tab title shows the status mark
 * from .pi/extensions/atom-title.ts; the transcript shows only the
 * model's reasoning and answer, with a boat while it works.
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
  const labels = { idle: 'Idle', working: 'Working', done: 'Done' };
  stateLabel.textContent = labels[status];
  if (status === 'working' && !reduceMotion) {
    let frame = 0;
    spin = setInterval(() => { mark.textContent = SPINNER[frame++ % SPINNER.length]; }, 120);
  } else {
    mark.textContent = { idle: '○', working: '⠋', done: '✓' }[status];
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

// The boat sails while the model works; its tool calls never reach the transcript.
function sail() {
  const p = document.createElement('p');
  p.className = 'boat';
  p.setAttribute('aria-label', 'Working');
  p.innerHTML = '<span class="sea" aria-hidden="true"></span><span class="ship" aria-hidden="true">⛵</span>';
  term.appendChild(p);
  return p;
}

async function work(ms, id) {
  const boat = sail();
  await sleep(reduceMotion ? 300 : ms);
  boat.remove();
  return id === run;
}

// Only reasoning and the answer are shown. In between, the model reads files and runs
// tests, but those calls stay out of view: the boat is all you see.
const STEPS = [
  { work: 2600, think: 'The failure is only on 29 Feb, so the leap-year check is the first suspect. I want to see where the parser validates the day.' },
  { work: 3000, think: 'The parser builds the date before it has read the year, so it checks 29 Feb against the default year, which is not a leap year. Reading the year first fixes it without touching the other formats.' },
  { work: 2800, think: 'Made the change and added a test for 29 Feb in a leap year and in a common year. The whole suite passes.' },
];

async function session() {
  const id = ++run;
  while (id === run) {
    term.innerHTML = '';
    setStatus('idle');
    await sleep(900);
    if (id !== run) return;
    if (!await type('you', 'The date parser fails on 29 Feb. Find out why and fix it.', id)) return;
    await sleep(500);
    setStatus('working');
    for (const step of STEPS) {
      if (!await work(step.work, id)) return;
      line('think', step.think);
      await sleep(1200);
      if (id !== run) return;
    }
    if (!await work(1600, id)) return;
    line('model', 'Fixed. The parser now reads the year before it validates the day, so 29 Feb is accepted in leap years and still rejected in other years. One new test covers both cases.');
    setStatus('done');
    await sleep(7000);
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
