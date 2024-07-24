const parent = document.getElementById('container');
const container = document.getElementById("user-input-container");
const legend = document.getElementById('legend');
const draggables = document.querySelectorAll('div.draggable-field');

let offsetX, offsetY;

for (const draggable of draggables) {
  draggable.addEventListener('mousedown', drag);
  draggable.addEventListener('mouseup', (ev) => {
    document.removeEventListener('mousemove', move)
  }) 
}

function drag(ev) {
  if (!ev.currentTarget.classList.contains('draggable-field')) { return; };

  offsetX = ev.clientX - ev.currentTarget.parentElement.offsetLeft;
  offsetY = ev.clientY - ev.currentTarget.parentElement.offsetTop;
  document.addEventListener('mousemove', move);
}

function move(ev) {
  if (!ev.target.classList.contains('draggable-field')) { return; };

  var newX = ev.clientX - offsetX;
  var newY = ev.clientY - offsetY;

  if (newX < 0) { newX = 0; }
  if (newX + ev.target.parentNode.offsetWidth > parent.offsetWidth) {
    newX = parent.offsetWidth - ev.target.parentNode.offsetWidth;
  }
  if (newY < 0) { newY = 0; }
  if (newY + ev.target.parentNode.offsetHeight > parent.offsetHeight) {
    newY = parent.offsetHeight - ev.target.parentNode.offsetHeight;
  }

  ev.target.parentNode.style.left = `${newX}px`;
  ev.target.parentNode.style.top = `${newY}px`;
}

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
    .getElementById("redraw-btn")
    .addEventListener("click", handleRedraw);
}
