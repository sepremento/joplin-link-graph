const container = document.getElementById("user-input-container");

let offsetX, offsetY;

const move = (ev) => {
  container.style.left = `${ev.clientX - offsetX}px`;
  container.style.top = `${ev.clientY - offsetY}px`;
}

container.addEventListener('mousedown', (ev) => {
  offsetX = ev.clientX - container.offsetLeft;
  offsetY = ev.clientY - container.offsetTop;
  document.addEventListener('mousemove', move);
})

container.addEventListener('mouseup', () => {
  document.removeEventListener('mousemove', move);
})

function chromeRangeInputFix() {
  // workaround for chrome concerning range inputs,
  // not allowing slider to be dragged.
  // See https://stackoverflow.com/q/69490604
  // todo: is there a better solution?
  document
    .querySelectorAll('input[type="range"]')
    .forEach((input) => {
      input.addEventListener("mousedown", () =>
        window.getSelection().removeAllRanges()
      );
    });
}

function initDistanceRangeInput(initialValue, handleChange) {
  const html = `
  <div>
    <label for="maxDistance">Max. distance</label>
    <input 
      name="maxDistance"
      type="range"
      min="0"
      value="${initialValue}"
      max="5"
      step="1"
    >
    <output>${initialValue}</output>
  </div>
  `;

  container.insertAdjacentHTML("beforeend", html);
  const input = container.querySelector("input[name='maxDistance']")
  input.addEventListener("input", function () {
    const output = this.nextElementSibling;
    output.value = this.value;
  });
  input.addEventListener("change", function () {
    handleChange(this.valueAsNumber);
  });
}

export function initQueryInput(handle) {
  const html = `
  <div>
  <label for="userQuery">Query</label>
  <input name="userQuery" type="text" value="">
  <input type="button" id="submit-query-btn" value="Submit">
  </div>
  `
  container.insertAdjacentHTML("beforeend", html);
  const userQuery = container.querySelector("input[name='userQuery']");
  const submitBtn = container.querySelector("#submit-query-btn");
  submitBtn.addEventListener("click", () => { handle(userQuery.value); })
}

export function init(initDistanceValue, handleDistanceChange, handleRedraw) {
  chromeRangeInputFix();
  initDistanceRangeInput(initDistanceValue, handleDistanceChange);
  document
    .getElementById("redrawButton")
    .addEventListener("click", handleRedraw);
}
