const state = {
  topics: [],
  selectedTopic: null,
  quiz: null,
  current: 0,
  answers: [],
  selectedChoice: null,
};

const elements = {
  topics: document.getElementById("topics"),
  count: document.getElementById("count"),
  countHint: document.getElementById("count-hint"),
  startBtn: document.getElementById("start-btn"),
  quizScreen: document.getElementById("quiz-screen"),
  quizTopic: document.getElementById("quiz-topic"),
  quizProgress: document.getElementById("quiz-progress"),
  progress: document.querySelector(".progress"),
  progressBar: document.getElementById("progress-bar"),
  questionText: document.getElementById("question-text"),
  choices: document.getElementById("choices"),
  previousBtn: document.getElementById("previous-btn"),
  nextBtn: document.getElementById("next-btn"),
  resultScreen: document.getElementById("result-screen"),
  score: document.getElementById("score"),
  scoreMessage: document.getElementById("score-message"),
  review: document.getElementById("review"),
  againBtn: document.getElementById("again-btn"),
  error: document.getElementById("error"),
};

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    throw new Error("Could not reach the server. Is it still running?");
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : "The server returned an error.";
    throw new Error(message);
  }
  return data;
}

function showScreen(name) {
  ["start", "quiz", "result"].forEach((screen) => {
    document
      .getElementById(`${screen}-screen`)
      .classList.toggle("hidden", screen !== name);
  });
}

function showError(message = "") {
  elements.error.textContent = message;
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));
  elements.progressBar.style.width = `${value}%`;
  elements.progress.setAttribute("aria-valuenow", String(Math.round(value)));
}

function selectTopic(topic) {
  state.selectedTopic = topic;
  elements.topics.querySelectorAll(".topic").forEach((button) => {
    button.classList.toggle("selected", button.dataset.topic === topic.id);
  });

  elements.count.max = topic.count;
  elements.count.value = Math.min(5, topic.count);
  elements.countHint.textContent = `Choose between 1 and ${topic.count}.`;
  showError("");
}

function renderTopics() {
  elements.topics.innerHTML = "";

  state.topics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic";
    button.dataset.topic = topic.id;

    const name = document.createElement("span");
    name.className = "topic-name";
    name.textContent = topic.label;

    const count = document.createElement("span");
    count.className = "topic-count";
    count.textContent = `${topic.count} questions`;

    button.append(name, count);
    button.addEventListener("click", () => selectTopic(topic));
    elements.topics.appendChild(button);
  });

  const defaultTopic =
    state.topics.find((topic) => topic.id === "all") || state.topics[0];
  if (defaultTopic) {
    selectTopic(defaultTopic);
  }
}

async function loadTopics() {
  try {
    state.topics = await api("/api/topics");
    renderTopics();
  } catch (error) {
    showError(error.message);
    elements.startBtn.disabled = true;
  }
}

async function startQuiz() {
  if (!state.selectedTopic) {
    showError("Choose a topic first.");
    return;
  }

  const count = Number(elements.count.value);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > state.selectedTopic.count
  ) {
    showError(`Enter a number between 1 and ${state.selectedTopic.count}.`);
    return;
  }

  showError("");
  elements.startBtn.disabled = true;
  elements.startBtn.textContent = "Starting...";

  try {
    const quiz = await api("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: state.selectedTopic.id, count }),
    });

    state.quiz = quiz;
    state.current = 0;
    state.answers = new Array(quiz.total).fill(null);
    state.selectedChoice = null;

    elements.quizTopic.textContent = quiz.topic;
    showScreen("quiz");
    renderQuestion();
  } catch (error) {
    showError(error.message);
  } finally {
    elements.startBtn.disabled = false;
    elements.startBtn.textContent = "Start quiz";
  }
}

function renderQuestion() {
  const question = state.quiz.questions[state.current];
  const savedAnswer = state.answers[state.current];
  state.selectedChoice = Number.isInteger(savedAnswer) ? savedAnswer : null;
  showError("");

  elements.quizProgress.textContent = `Question ${state.current + 1} of ${state.quiz.total}`;
  setProgress((state.current / state.quiz.total) * 100);
  elements.questionText.textContent = question.question;
  elements.choices.innerHTML = "";

  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.classList.toggle("selected", state.selectedChoice === index);

    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String(index + 1);

    const text = document.createElement("span");
    text.textContent = choice;

    button.append(key, text);
    button.addEventListener("click", () => selectChoice(index));
    elements.choices.appendChild(button);
  });

  const isLast = state.current === state.quiz.total - 1;
  elements.previousBtn.disabled = state.current === 0;
  elements.nextBtn.disabled = state.selectedChoice === null;
  elements.nextBtn.textContent = isLast ? "Finish quiz" : "Next question";
}

function selectChoice(index) {
  state.selectedChoice = index;
  state.answers[state.current] = index;
  elements.choices.querySelectorAll(".choice").forEach((button, buttonIndex) => {
    button.classList.toggle("selected", buttonIndex === index);
  });
  elements.nextBtn.disabled = false;
}

function previousQuestion() {
  if (state.current === 0) {
    return;
  }
  state.current -= 1;
  renderQuestion();
}

async function nextQuestion() {
  if (state.selectedChoice === null) {
    return;
  }

  if (state.current < state.quiz.total - 1) {
    state.current += 1;
    renderQuestion();
    return;
  }

  if (state.answers.includes(null)) {
    showError("Please answer every question before finishing.");
    return;
  }

  await submitQuiz();
}

async function submitQuiz() {
  elements.nextBtn.disabled = true;
  elements.nextBtn.textContent = "Scoring...";
  setProgress(100);

  try {
    const result = await api("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizId: state.quiz.quizId,
        answers: state.answers,
      }),
    });

    renderResults(result);
    showScreen("result");
  } catch (error) {
    showError(error.message);
    elements.nextBtn.disabled = false;
    elements.nextBtn.textContent = "Finish quiz";
  }
}

function renderResults(result) {
  elements.score.textContent = `You scored ${result.score} out of ${result.total} (${result.percentage}%).`;
  elements.scoreMessage.textContent = result.message;
  elements.review.innerHTML = "";

  if (result.review.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing to review. You answered every question correctly.";
    elements.review.appendChild(empty);
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = "Wrong answer review";
  elements.review.appendChild(heading);

  result.review.forEach((item) => {
    const card = document.createElement("article");
    card.className = "review-card";

    const meta = document.createElement("p");
    meta.className = "review-meta";
    meta.textContent = item.topic;

    const question = document.createElement("h4");
    question.textContent = item.question;

    const chosen = document.createElement("p");
    chosen.className = "answer wrong";
    chosen.textContent = `Your answer: ${item.chosen}`;

    const correct = document.createElement("p");
    correct.className = "answer correct";
    correct.textContent = `Correct answer: ${item.correct}`;

    const suggestion = document.createElement("p");
    suggestion.className = "suggestion";
    suggestion.textContent = `Suggestion: ${item.explanation}`;

    card.append(meta, question, chosen, correct, suggestion);
    elements.review.appendChild(card);
  });
}

function resetQuiz() {
  state.quiz = null;
  state.current = 0;
  state.answers = [];
  state.selectedChoice = null;
  showError("");
  showScreen("start");
}

document.addEventListener("keydown", (event) => {
  if (elements.quizScreen.classList.contains("hidden")) {
    return;
  }

  const question = state.quiz && state.quiz.questions[state.current];
  if (!question) {
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (index < question.choices.length) {
      selectChoice(index);
    }
  }

  if (event.key === "Enter" && !elements.nextBtn.disabled) {
    event.preventDefault();
    nextQuestion();
  }

  if (event.key === "ArrowLeft" && !elements.previousBtn.disabled) {
    event.preventDefault();
    previousQuestion();
  }
});

elements.startBtn.addEventListener("click", startQuiz);
elements.previousBtn.addEventListener("click", previousQuestion);
elements.nextBtn.addEventListener("click", nextQuestion);
elements.againBtn.addEventListener("click", resetQuiz);

loadTopics();
