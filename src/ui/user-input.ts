const graphContainer = document.getElementById('container');
const draggables = document.querySelectorAll('div.drag-handle');

const queryInput = document.getElementById("query-input") as HTMLInputElement;
const filterInput = document.getElementById("filter-input") as HTMLInputElement;
const distOutput = document.getElementById("distance-output") as HTMLOutputElement;

const groupInput = document.getElementById("group-stub") as HTMLInputElement;
const addGroupBtn = document.getElementById("add-group-btn") as HTMLInputElement;

const chargeStrengthInput = document.getElementById("charge-strength-input") as HTMLInputElement;
const centerStrenthInput = document.getElementById("center-strength-input") as HTMLInputElement;
const collideRadiusInput = document.getElementById("nocollide-radius-input") as HTMLInputElement;
const radiusScaleInput = document.getElementById("radius-scale-input") as HTMLInputElement;
const linkStrenthInput = document.getElementById("link-strength-input") as HTMLInputElement;
const linkDistanceInput = document.getElementById("link-distance-input") as HTMLInputElement;
const showTagsSwitch = document.getElementById("show-tags-switch") as HTMLInputElement;
const maxDistInput = document.getElementById("distance-slider") as HTMLInputElement;
const temperatureInput = document.getElementById("temperature-slider") as HTMLInputElement;

const scale = [
    "#a6cee3", "#1f78b4", "#b2df8a", "#33a02c", "#fb9a99", "#e31a1c",
    "#fdbf6f", "#ff7f00", "#cab2d6", "#6a3d9a", "#ffff99", "#b15928"
]

let offsetX: number, offsetY: number;

for (const draggable of draggables) {
    draggable.addEventListener('mousedown', drag);
    draggable.addEventListener('mouseup', (_) => {
        document.removeEventListener('mousemove', move)
    }) 
    draggable.addEventListener('mouseout', (_) => {
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
    queryInput.value = settings.query;
    filterInput.value = settings.filter;
    showTagsSwitch.checked = settings.showTags;
    maxDistInput.value = settings.maxDepth;
    distOutput.innerHTML = settings.maxDepth;

    chargeStrengthInput.value = settings.chargeStrength;
    centerStrenthInput.value = settings.centerStrength;
    collideRadiusInput.value = settings.collideRadius;
    radiusScaleInput.value = settings.radiusScale;
    linkDistanceInput.value = settings.linkDistance;
    linkStrenthInput.value = settings.linkStrength;
    temperatureInput.value = settings.alpha;

}

function makeGroupValues() {
    const groupDivs = document.querySelectorAll(".groups");

    const groupValues = {};

    for (let i=0; i<groupDivs.length; i++) {
        const input = groupDivs[i].querySelector(".group-input") as HTMLInputElement;
        const name = groupDivs[i].id
        const filter = input.value.trim();
        const color = (groupDivs[i].querySelector(".group-color") as HTMLInputElement).value;

        if (filter) groupValues[name] ={
            filter: filter,
            color: color
        };

    }

    return groupValues
}

export function addGroupEventListeners(setSetting) {
    const oldInputs = document.querySelectorAll(".group-input");
    const oldColors = document.querySelectorAll(".group-color");
    const oldDels = document.querySelectorAll(".del-btn");

    const newInputs = [];
    const newColors = [];
    const newDels = [];

    for (let i=0; i<oldInputs.length; i++) {
        const oldGroupInput = oldInputs[i];
        const oldGroupColor = oldColors[i];
        const oldDel = oldDels[i];
        const newGroupInput = oldGroupInput.cloneNode(true);
        const newGroupColor = oldGroupColor.cloneNode(true);
        const newDel = oldDel.cloneNode(true);

        oldGroupInput.parentNode.replaceChild(newGroupInput, oldGroupInput);
        oldGroupColor.parentNode.replaceChild(newGroupColor, oldGroupColor);
        oldDel.parentNode.replaceChild(newDel, oldDel);

        newInputs.push(newGroupInput);
        newColors.push(newGroupColor);
        newDels.push(newDel);

    };

    for (let i=0; i<newInputs.length; i++) {
        const newGroupColor = newColors[i];
        const newGroupInput = newInputs[i];
        const newDel = newDels[i];

        newGroupInput.addEventListener("keypress", (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                setSetting("GROUPS", makeGroupValues());
            }
        })
        newGroupColor.addEventListener("change", () => {
            setSetting("GROUPS", makeGroupValues());
        });

        newDel.addEventListener("click", () => {
            newDel.parentNode.parentNode.removeChild(newDel.parentNode);
            const remainedElements = document.querySelectorAll(".groups");
            let n = 1;
            for (let el of remainedElements) {
                // el.setAttribute("id", n);
                const input = el.querySelector(".group-input");
                const delBtn = el.querySelector(".del-btn");
                input.setAttribute("data", `${n}`);
                delBtn.setAttribute("id", `del-group-${n}`);
                n++;
            }
            setSetting("GROUPS", makeGroupValues());
        });
    }
}

export function initFront(initialValues, setSetting) {

    chromeRangeInputFix();
    setupGraphHandle(initialValues);

    const groupNames = Object.keys(initialValues.groups)

    //setting up color groups separately because setupGraphHandle is called
    //in another part of code so stands in the way
    for (let i=0; i<groupNames.length; i++) {
        const groupBlockStub = document.getElementById("group-block-stub");
        const name = groupNames[i] ? groupNames[i] : generateRandomString(8);
        const filter = initialValues.groups[name].filter;
        const color = initialValues.groups[name].color;
        const n = i+1;
        groupBlockStub.insertAdjacentHTML("beforebegin",
            `<div class="control-block groups" id="${name}">
             <input class="group-input" type="string" data="${n}" value="${filter}"></input>
             <input class="group-color" type="color" value="${color}"></input>
             <input class="del-btn" id="del-group-${n}" type="button" value="🗑"></input>
             </div>`
        )
    }

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
    showTagsSwitch.addEventListener("change", () => {
        setSetting("SHOW_TAGS", showTagsSwitch.checked);
    });
    maxDistInput.addEventListener("change", () => {
        setSetting("MAX_TREE_DEPTH", maxDistInput.value);
    });
    queryInput.addEventListener("keypress", (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            setSetting("QUERY", queryInput.value);
        }
    });
    filterInput.addEventListener("keypress", (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            setSetting("FILTER", filterInput.value);
        }
    });
    maxDistInput.addEventListener("input", () => {
        distOutput.value = maxDistInput.value;
    });

    groupInput.addEventListener("keypress", (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            addGroupBtn.click();
        }
    });

    addGroupBtn.addEventListener("click", () => {
        const groupDivs = document.querySelectorAll("div.groups");
        const n = groupDivs.length + 1;
        const groupBlockStub = document.getElementById("group-block-stub");
        const name = generateRandomString(8);
        const filterText = groupInput.value;
        const colorEl = (document.getElementById("color-stub") as HTMLInputElement);
        const color = colorEl.value;
        groupBlockStub.insertAdjacentHTML("beforebegin",
            `<div class="control-block groups" id="${name}">
             <input class="group-input" type="string" data="${n}" value="${filterText}"></input>
             <input class="group-color" type="color" value="${color}"></input>
             <input class="del-btn" id="del-group-${n}" type="button" value="🗑"></input>
             </div>`
        )
        groupInput.value = "";
        groupInput.focus()
        const newColor = pickRandomColor(color);
        colorEl.value = newColor;

        addGroupEventListeners(setSetting);
        setSetting("GROUPS", makeGroupValues());
    });

    addGroupEventListeners(setSetting);
}

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}

function pickRandomColor(curColor) {
    let color = '';
    do {
        color = scale[Math.floor(Math.random()*scale.length)];
    } while (color === curColor)
    return color;
}
