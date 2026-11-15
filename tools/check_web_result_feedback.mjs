#!/usr/bin/env node
/*
 * Exercise the web client's score-feedback and navigation logic.
 *
 * Usage:
 *     node tools/check_web_result_feedback.mjs
 *
 * The script loads web/app.js in a small DOM stub, then checks the 39/40/59/60/
 * 79/80/100 score boundaries, confetti gating, reduced-motion handling, and that
 * answer selections survive previous/next navigation. It prints a JSON report
 * and exits with status 0 only when every check passes.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(projectRoot, "web", "app.js");

function createClassList() {
  let classes = new Set();
  return {
    add(...names) {
      names.forEach((name) => classes.add(name));
    },
    remove(...names) {
      names.forEach((name) => classes.delete(name));
    },
    toggle(name, force) {
      if (force === undefined) {
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      }
      if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
      return Boolean(force);
    },
    contains(name) {
      return classes.has(name);
    },
    replaceClasses(value) {
      classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
    },
    toString() {
      return [...classes].join(" ");
    },
  };
}

function createElement(id = "") {
  const classList = createClassList();
  let html = "";
  const element = {
    id,
    tagName: "DIV",
    children: [],
    dataset: {},
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    classList,
    textContent: "",
    disabled: false,
    value: "5",
    max: "5",
    offsetWidth: 100,
    append(...nodes) {
      element.children.push(...nodes);
    },
    appendChild(node) {
      element.children.push(node);
      return node;
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    querySelector(selector) {
      if (selector && selector.startsWith(".")) {
        const name = selector.slice(1);
        return element.children.find((child) => child.classList?.contains(name)) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector && selector.startsWith(".")) {
        const name = selector.slice(1);
        return element.children.filter((child) => child.classList?.contains(name));
      }
      return [];
    },
    getBoundingClientRect() {
      return { width: 100, height: 40, left: 0, top: 0 };
    },
    closest() {
      return null;
    },
    remove() {},
  };

  Object.defineProperty(element, "className", {
    get() {
      return classList.toString();
    },
    set(value) {
      classList.replaceClasses(value);
    },
  });

  Object.defineProperty(element, "innerHTML", {
    get() {
      return html;
    },
    set(value) {
      html = String(value);
      if (html === "") {
        element.children.length = 0;
      }
    },
  });

  return element;
}

const elementsById = new Map();
function getElement(id) {
  if (!elementsById.has(id)) {
    elementsById.set(id, createElement(id));
  }
  return elementsById.get(id);
}

const documentStub = {
  documentElement: {
    dataset: { theme: "light" },
    classList: createClassList(),
  },
  getElementById: getElement,
  querySelector(selector) {
    if (selector === ".progress") {
      return getElement("progress");
    }
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return createElement();
  },
  addEventListener() {},
};

const topicsPayload = [
  { id: "all", label: "All topics", count: 5 },
  { id: "python", label: "Python", count: 3 },
];

const windowStub = {
  matchMedia() {
    return { matches: false };
  },
  setTimeout() {
    return 0;
  },
};

const context = vm.createContext({
  console,
  document: documentStub,
  window: windowStub,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  fetch: async (url) => ({
    ok: true,
    async json() {
      return url === "/api/topics" ? topicsPayload : {};
    },
  }),
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  setTimeout() {
    return 0;
  },
  clearTimeout() {},
});

const source =
  fs.readFileSync(appPath, "utf8") +
  "\n;globalThis.__quizTest = { state, elements, RESULT_FEEDBACK, scorePercentage, feedbackForPercentage, renderResults, applyResultFeedback, renderQuestion, selectChoice, previousQuestion, nextQuestion };";

vm.runInContext(source, context, { filename: "web/app.js" });
await new Promise((resolve) => setImmediate(resolve));

const app = context.__quizTest;
const failures = [];
const cases = [];

async function recordCase(name, checks) {
  const caseFailures = [];
  const assert = (condition, message) => {
    if (!condition) {
      caseFailures.push(message);
    }
  };

  await checks(assert);

  const result = { case: name, passed: caseFailures.length === 0 };
  if (caseFailures.length > 0) {
    result.failures = caseFailures;
  }
  cases.push(result);
  failures.push(...caseFailures);
}

const boundaryCases = [
  { label: "39%", score: 39, total: 100, tier: "keep-practicing", message: "Keep practicing!" },
  { label: "40%", score: 2, total: 5, tier: "good-effort", message: "Good effort! Try again." },
  { label: "59%", score: 59, total: 100, tier: "good-effort", message: "Good effort! Try again." },
  { label: "60%", score: 3, total: 5, tier: "well-done", message: "Well done!" },
  { label: "79%", score: 79, total: 100, tier: "well-done", message: "Well done!" },
  { label: "80%", score: 4, total: 5, tier: "excellent", message: "Excellent work!" },
  { label: "100%", score: 5, total: 5, tier: "excellent", message: "Excellent work!" },
];

for (const boundary of boundaryCases) {
  await recordCase(`score ${boundary.label}`, (assert) => {
    const tier = app.renderResults({
      score: boundary.score,
      total: boundary.total,
      percentage: 999,
      message: "server message must not control the tier",
      review: [],
    });

    assert(tier === boundary.tier, `expected tier ${boundary.tier}, got ${tier}`);
    assert(
      app.elements.scoreMessage.textContent === boundary.message,
      `expected message "${boundary.message}", got "${app.elements.scoreMessage.textContent}"`,
    );
    assert(
      app.elements.scorePercent.textContent === boundary.label,
      `expected ${boundary.label}, got ${app.elements.scorePercent.textContent}`,
    );
    assert(
      app.elements.score.textContent ===
        `You scored ${boundary.score} out of ${boundary.total}.`,
      `unexpected score text: ${app.elements.score.textContent}`,
    );

    app.applyResultFeedback(tier);
    const confettiCount = app.elements.confetti.children.length;
    const trophyHidden = app.elements.trophy.classList.contains("hidden");
    const expectsConfetti = boundary.tier === "excellent";

    assert(
      expectsConfetti ? confettiCount > 0 : confettiCount === 0,
      expectsConfetti
        ? "expected confetti for an excellent result"
        : "confetti must not appear below 80%",
    );
    assert(
      trophyHidden === !expectsConfetti,
      expectsConfetti
        ? "trophy should be visible for an excellent result"
        : "trophy should stay hidden below 80%",
    );
    assert(
      app.elements.resultScreen.classList.contains(`tier-${boundary.tier}`),
      `missing tier-${boundary.tier} class on the results screen`,
    );
  });
}

await recordCase("reduced motion", (assert) => {
  const originalMatchMedia = windowStub.matchMedia;
  windowStub.matchMedia = () => ({ matches: true });
  app.applyResultFeedback("excellent");
  assert(
    app.elements.confetti.children.length === 0,
    "confetti must not be created when reduced motion is requested",
  );
  assert(
    !app.elements.trophy.classList.contains("hidden"),
    "trophy should still be visible with reduced motion",
  );
  windowStub.matchMedia = originalMatchMedia;
});

await recordCase("navigation preserves answers", async (assert) => {
  app.state.quiz = {
    quizId: "test",
    topic: "Test",
    total: 2,
    questions: [
      { question: "Question one", choices: ["A", "B", "C"] },
      { question: "Question two", choices: ["A", "B", "C"] },
    ],
  };
  app.state.current = 0;
  app.state.answers = [null, null];
  app.state.selectedChoice = null;

  app.renderQuestion();
  app.selectChoice(2);
  assert(app.state.answers[0] === 2, "first answer was not stored");

  await app.nextQuestion();
  assert(app.state.current === 1, "next question did not advance");

  app.selectChoice(0);
  app.previousQuestion();
  assert(app.state.current === 0, "previous question did not move back");
  assert(app.state.selectedChoice === 2, "saved first answer was not restored");
  assert(app.state.answers[0] === 2, "first answer changed during navigation");

  await app.nextQuestion();
  assert(app.state.current === 1, "returning forward did not restore the second question");
  assert(app.state.selectedChoice === 0, "saved second answer was not restored");
});

const report = {
  passed: failures.length === 0,
  cases,
  failures,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
