import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "web", "app.js");
const htmlPath = path.join(root, "web", "index.html");

class ClassList {
  constructor(classes) {
    this._set = new Set(classes);
  }
  add(...names) {
    names.forEach((name) => this._set.add(name));
  }
  remove(...names) {
    names.forEach((name) => this._set.delete(name));
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    if (force === undefined) {
      if (this._set.has(name)) {
        this._set.delete(name);
        return false;
      }
      this._set.add(name);
      return true;
    }
    if (force) {
      this._set.add(name);
      return true;
    }
    this._set.delete(name);
    return false;
  }
  get value() {
    return [...this._set].join(" ");
  }
}

class Element {
  constructor(tagName, id, classes) {
    this.tagName = tagName;
    this.id = id || "";
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = "";
    this.value = "";
    this.max = undefined;
    this.disabled = false;
    this._classList = new ClassList(classes);
  }
  get classList() {
    return this._classList;
  }
  get className() {
    return this._classList.value;
  }
  set className(value) {
    this._classList = new ClassList(String(value).split(/\s+/).filter(Boolean));
  }
  get innerHTML() {
    return "";
  }
  set innerHTML(value) {
    if (value === "") {
      this.children = [];
    }
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }
  querySelectorAll(selector) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.children.filter((child) => child.classList.contains(className));
    }
    return [];
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function parseDocument(html) {
  const byId = new Map();
  const registry = [];
  const tagPattern = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const attributes = match[2];
    const idMatch = /\bid\s*=\s*"([^"]*)"/i.exec(attributes);
    const classMatch = /\bclass\s*=\s*"([^"]*)"/i.exec(attributes);
    const id = idMatch ? idMatch[1] : "";
    const classes = classMatch
      ? classMatch[1].split(/\s+/).filter(Boolean)
      : [];
    const element = new Element(tagName, id, classes);
    registry.push(element);
    if (id && !byId.has(id)) {
      byId.set(id, element);
    }
  }
  return { byId, registry };
}

function createDocument(registry, byId) {
  return {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tagName) => new Element(tagName),
    querySelector: (selector) => {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        return registry.find((el) => el.classList.contains(className)) || null;
      }
      if (selector.startsWith("#")) {
        return byId.get(selector.slice(1)) || null;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.startsWith(".")) {
        const className = selector.slice(1);
        return registry.filter((el) => el.classList.contains(className));
      }
      return [];
    },
    addEventListener: () => {},
  };
}

function createFetchStub() {
  const topicsPayload = [
    { id: "python", label: "Python", count: 4 },
    { id: "all", label: "All topics", count: 4 },
  ];
  const quizPayload = {
    quizId: "test-quiz",
    topic: "All topics",
    total: 2,
    questions: [
      {
        topic: "Python",
        question: "Question one?",
        choices: ["Alpha", "Beta", "Gamma", "Delta"],
      },
      {
        topic: "Python",
        question: "Question two?",
        choices: ["Epsilon", "Zeta", "Eta", "Theta"],
      },
    ],
  };
  const calls = [];
  async function fetchStub(url, options = {}) {
    calls.push({ url, method: options.method || "GET" });
    if (url === "/api/topics") {
      return { ok: true, json: async () => topicsPayload };
    }
    if (url === "/api/quiz") {
      return { ok: true, json: async () => quizPayload };
    }
    return { ok: false, json: async () => ({ error: `unexpected ${url}` }) };
  }
  return { fetchStub, calls };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function waitFor(predicate, message, tries = 100) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (predicate()) {
      return;
    }
    await tick();
  }
  throw new Error(message);
}

function choiceButtonsOf(container) {
  return container.querySelectorAll(".choice");
}

async function main() {
  const checks = [];
  const check = (name, condition, detail) => {
    checks.push({ name, passed: Boolean(condition), detail: condition ? "" : detail });
  };

  const { byId, registry } = parseDocument(
    fs.readFileSync(htmlPath, "utf8"),
  );
  const { fetchStub } = createFetchStub();
  const documentStub = createDocument(registry, byId);

  const requiredIds = [
    "topics",
    "count",
    "count-hint",
    "start-btn",
    "start-screen",
    "quiz-screen",
    "quiz-topic",
    "quiz-progress",
    "progress-bar",
    "question-text",
    "choices",
    "previous-btn",
    "next-btn",
    "result-screen",
    "score",
    "score-message",
    "review",
    "again-btn",
    "error",
  ];
  const missingIds = requiredIds.filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    throw new Error(`index.html is missing required ids: ${missingIds.join(", ")}`);
  }

  const context = vm.createContext({
    document: documentStub,
    fetch: fetchStub,
    console,
  });
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: "web/app.js",
  });

  const click = async (element, type = "click") => {
    const handlers = element.listeners[type] || [];
    for (const handler of handlers) {
      await handler({ preventDefault() {} });
    }
  };

  await waitFor(
    () => byId.get("topics").children.length > 0,
    "topics never rendered (loadTopics did not finish)",
  );

  byId.get("count").value = "2";
  await click(byId.get("start-btn"));
  await waitFor(
    () => !byId.get("quiz-screen").classList.contains("hidden"),
    "quiz screen never opened",
  );

  const questionText = byId.get("question-text");
  const choicesContainer = byId.get("choices");
  const nextButton = byId.get("next-btn");
  const previousButton = byId.get("previous-btn");

  check(
    "question 1 is rendered on start",
    questionText.textContent === "Question one?",
    `question text was "${questionText.textContent}"`,
  );

  let choices = choiceButtonsOf(choicesContainer);
  check(
    "question 1 has four choices",
    choices.length === 4,
    `found ${choices.length} choices`,
  );

  await click(choices[1]);
  check(
    "selecting choice 2 highlights it",
    choices[1].classList.contains("selected"),
    "choice 2 was not highlighted after selection",
  );
  check(
    "next button is enabled after selecting",
    nextButton.disabled === false,
    "next button stayed disabled after selecting a choice",
  );

  await click(nextButton);
  await waitFor(
    () => questionText.textContent === "Question two?",
    "clicking Next did not move to question 2",
  );
  check(
    "Next moves to question 2",
    questionText.textContent === "Question two?",
    `question text was "${questionText.textContent}"`,
  );
  check(
    "previous button is enabled on question 2",
    previousButton.disabled === false,
    "previous button stayed disabled on question 2",
  );

  await click(previousButton);
  await waitFor(
    () => questionText.textContent === "Question one?",
    "clicking Back did not return to question 1",
  );
  check(
    "Back returns to question 1",
    questionText.textContent === "Question one?",
    `question text was "${questionText.textContent}"`,
  );

  choices = choiceButtonsOf(choicesContainer);
  check(
    "original selection is still highlighted after Back",
    choices[1].classList.contains("selected"),
    "choice 2 was no longer highlighted after navigating away and back",
  );
  check(
    "no other choice is highlighted after Back",
    choices.every((choice, index) =>
      index === 1 ? true : !choice.classList.contains("selected"),
    ),
    "more than one choice was highlighted after Back",
  );
  check(
    "next button is enabled after Back",
    nextButton.disabled === false,
    "next button was disabled after Back even though an answer was selected",
  );

  await click(choices[2]);
  check(
    "student can change the restored selection",
    choices[2].classList.contains("selected") &&
      !choices[1].classList.contains("selected"),
    "changing the selection from choice 2 to choice 3 did not update the highlight",
  );

  await click(nextButton);
  await waitFor(
    () => questionText.textContent === "Question two?",
    "second Next click did not move to question 2",
  );
  await click(previousButton);
  await waitFor(
    () => questionText.textContent === "Question one?",
    "second Back click did not return to question 1",
  );
  choices = choiceButtonsOf(choicesContainer);
  check(
    "changed selection persists after another Next/Back round trip",
    choices[2].classList.contains("selected") &&
      !choices[1].classList.contains("selected"),
    "the changed answer did not persist after navigating away and back",
  );

  const errors = checks.filter((entry) => !entry.passed);
  return {
    passed: errors.length === 0,
    test: "question 1 selection survives Next then Back and can be changed",
    checks,
    errors,
  };
}

let report;
try {
  report = await main();
} catch (error) {
  report = {
    passed: false,
    test: "question 1 selection survives Next then Back and can be changed",
    checks: [],
    errors: [{ name: "harness", detail: error && error.stack ? error.stack : String(error) }],
  };
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
