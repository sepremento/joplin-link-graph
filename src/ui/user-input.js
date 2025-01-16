const graphContainer = document.getElementById('container');
const draggables = document.querySelectorAll('div.drag-handle');

const queryInput = document.getElementById("query-input");
const distOutput = document.getElementById("distance-output");

const chargeStrengthInput = document.getElementById("charge-strength-input");
const centerStrenthInput = document.getElementById("center-strength-input");
const collideRadiusInput = document.getElementById("nocollide-radius-input");
const radiusScaleInput = document.getElementById("radius-scale-input");
const linkStrenthInput = document.getElementById("link-strength-input");
const linkDistanceInput = document.getElementById("link-distance-input");
const maxDistInput = document.getElementById("distance-slider");
const temperatureInput = document.getElementById("temperature-slider");

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

export function setupGraphHandle(settings) {
    chargeStrengthInput.value = settings.chargeStrength;
    centerStrenthInput.value = settings.centerStrength;
    collideRadiusInput.value = settings.collideRadius;
    radiusScaleInput.value = settings.radiusScale;
    linkDistanceInput.value = settings.linkDistance;
    linkStrenthInput.value = settings.linkStrength;
    temperatureInput.value = settings.alpha;
    maxDistInput.value = settings.maxDepth;
    distOutput.innerHTML = settings.maxDepth;
}

export function initFront(initialValues, setSetting, poll) {
    chromeRangeInputFix();
    setupGraphHandle(initialValues);

    chargeStrengthInput.addEventListener("change", () => {
        setSetting("CHARGE_STRENGTH", chargeStrengthInput.valueAsNumber);
    });
    centerStrenthInput.addEventListener("change", () => {
        setSetting("CENTER_STRENGTH", centerStrenthInput.valueAsNumber);
    });
    collideRadiusInput.addEventListener("change", () => {
        setSetting("COLLIDE_RADIUS", collideRadiusInput.valueAsNumber);
    });
    radiusScaleInput.addEventListener("change", () => {
        setSetting("RADIUS_SCALE", radiusScaleInput.valueAsNumber);
    });
    linkStrenthInput.addEventListener("change", () => {
        setSetting("LINK_STRENGTH", linkStrenthInput.valueAsNumber);
    });
    linkDistanceInput.addEventListener("change", () => {
        setSetting("LINK_DISTANCE", linkDistanceInput.valueAsNumber);
    });
    temperatureInput.addEventListener("change", () => {
        setSetting("ALPHA", temperatureInput.valueAsNumber);
    });
    maxDistInput.addEventListener("change", () => {
        poll(queryInput.value, maxDistInput.value);
    });
    maxDistInput.addEventListener("input", () => {
        distOutput.value = maxDistInput.value;
    });
    queryInput.addEventListener("keypress", (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            poll(queryInput.value, maxDistInput.value);
        }
    });
}
