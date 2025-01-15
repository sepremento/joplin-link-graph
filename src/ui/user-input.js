const graphContainer = document.getElementById('container');
const draggables = document.querySelectorAll('div.drag-handle');

let offsetX, offsetY;

for (const draggable of draggables) {
  draggable.addEventListener('mousedown', drag);
  draggable.addEventListener('mouseup', (ev) => {
    document.removeEventListener('mousemove', move)
  }) 
  draggable.addEventListener('mouseout', (ev) => {
    document.removeEventListener('mousemove', move)
  }) 
}

function drag(ev) {
  if (!ev.currentTarget.classList.contains('drag-handle')) { return; };

  offsetX = ev.clientX - ev.currentTarget.parentElement.offsetLeft;
  offsetY = ev.clientY - ev.currentTarget.parentElement.offsetTop;
  document.addEventListener('mousemove', move);
}

function move(ev) {
  if (!ev.target.classList.contains('drag-handle')) { return; };

  var newX = ev.clientX - offsetX;
  var newY = ev.clientY - offsetY;

  if (newX < 0) { newX = 0; }
  if (newX + ev.target.parentNode.offsetWidth > graphContainer.offsetWidth) {
    newX = graphContainer.offsetWidth - ev.target.parentNode.offsetWidth;
  }
  if (newY < 0) { newY = 0; }
  if (newY + ev.target.parentNode.offsetHeight > graphContainer.offsetHeight) {
    newY = graphContainer.offsetHeight - ev.target.parentNode.offsetHeight;
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

export function initQueryInput(handle) {
    const userQuery = document.getElementById("query-input");
    const submitBtn = document.getElementById("submit-btn");
    submitBtn.addEventListener("click", () => { handle(userQuery.value); })
    userQuery.addEventListener("keypress", (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            submitBtn.click();
        }
    })
}

export function init(initialValues, handleSettingChange, handleRedraw) {
    chromeRangeInputFix();

    const chargeStrengthInput = document.getElementById("charge-strength-input");
    const centerStrenthInput = document.getElementById("center-strength-input");
    const collideRadiusInput = document.getElementById("nocollide-radius-input");
    const linkStrenthInput = document.getElementById("link-strength-input");
    const linkDistanceInput = document.getElementById("link-distance-input");
    const maxDistInput = document.getElementById("distance-slider");
    const temperatureInput = document.getElementById("temperature-slider");

    const distOutput = document.getElementById("distance-output");
    const redrawBtn = document.getElementById("redraw-btn");

    chargeStrengthInput.value = initialValues.chargeStrength;
    centerStrenthInput.value = initialValues.centerStrength;
    collideRadiusInput.value = initialValues.collideRadius;
    linkDistanceInput.value = initialValues.linkDistance;
    linkStrenthInput.value = initialValues.linkStrength;
    temperatureInput.value = initialValues.alpha;
    maxDistInput.value = initialValues.maxDepth;

    chargeStrengthInput.addEventListener("change", () => {
        handleSettingChange("CHARGE_STRENGTH", chargeStrengthInput.valueAsNumber);
    });
    centerStrenthInput.addEventListener("change", () => {
        handleSettingChange("CENTER_STRENGTH", centerStrenthInput.valueAsNumber);
    });
    collideRadiusInput.addEventListener("change", () => {
        handleSettingChange("COLLIDE_RADIUS", collideRadiusInput.valueAsNumber);
    });
    linkStrenthInput.addEventListener("change", () => {
        handleSettingChange("LINK_STRENGTH", linkStrenthInput.valueAsNumber);
    });
    linkDistanceInput.addEventListener("change", () => {
        handleSettingChange("LINK_DISTANCE", linkDistanceInput.valueAsNumber);
    });
    maxDistInput.addEventListener("change", () => {
        handleSettingChange("MAX_TREE_DEPTH", maxDistInput.valueAsNumber);
    });
    temperatureInput.addEventListener("change", () => {
        handleSettingChange("ALPHA", temperatureInput.valueAsNumber);
    });
    maxDistInput.addEventListener("input", () => {
        distOutput.value = maxDistInput.value;
    });
    redrawBtn.addEventListener("click", handleRedraw);
}
