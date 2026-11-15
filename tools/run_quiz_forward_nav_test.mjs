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
    { id: "python", label: "Python", count: 2 },
    { id: "all", label: "All topics", count: 2 },
  ];
  const quizPayload = {
    quizId: "forward-nav-quiz",
    topic: "Python",
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
  async function fetchStub(url, options = {}) {
    if (url === "/api/topics") {
      return { ok: true, json: async () => topicsPayload };
    }
    if (url === "/api/quiz") {
      return { ok: true, json: async () => quizPayload };
    }
    return { ok: false, json: async () => ({ error: `unexpected ${url}` }) };
  }
  return { fetchStub };
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

async function main() {
  const checks = [];
  const check = (name, condition, detail) => {
    checks.push({ name, passed: Boolean(condition), detail: condition ? "" : detail });
  };

  const { byId, registry } = parseDocument(fs.readFileSync(htmlPath, "utf8"));
  const { fetchStub } = createFetchStub();
  const documentStub = createDocument(registry, byId);

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
  const nextButton = byId.get("next-btn");

  check(
    "quiz starts on question 1",
    questionText.textContent === "Question one?",
    `question text was "${questionText.textContent}"`,
  );

  check(
    "Next can move forward before the first question is answered",
    nextButton.disabled === false,
    "Next was disabled before an answer was selected, so the student cannot move forward before answering",
  );

  await click(nextButton);

  check(
    "clicking Next moves to question 2 without a saved answer",
    questionText.textContent === "Question two?",
    `after clicking Next the question text was "${questionText.textContent}"`,
  );

  const errors = checks.filter((entry) => !entry.passed);
  return {
    passed: errors.length === 0,
    test: "students can move forward before answering a question",
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
    test: "students can move forward before answering a question",
    checks: [],
    errors: [
      {
        name: "harness",
        detail: error && error.stack ? error.stack : String(error),
      },
    ],
  };
}

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
