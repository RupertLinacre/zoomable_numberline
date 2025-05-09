// script.js

// --- Sanity check ---
console.log("🛠 app loaded");
if (typeof d3 === 'undefined') {
    console.error("❌ D3 failed to load");
} else {
    console.log("✅ D3 v7 is ready:", d3.version);
}

// --- Shared margins & dimensions ---
const margin = { left: 40, right: 40, top: 20, bottom: 20 };
const height = 100;
const innerH = height - margin.top - margin.bottom;

// --- Central state & dispatcher ---
const state = {
    topDomain: [-2, 10],
    brushExtent: [0, 2],
    detailDomain: null    // null → use brushExtent
};
const bus = d3.dispatch('stateChanged');

// --- Constraint enforcement (centralized) ---
function enforceConstraints() {
    // 1. Ensure topDomain encloses brushExtent (prevents zooming past selection)
    {
        const [b0, b1] = state.brushExtent;
        let [t0, t1] = state.topDomain;
        t0 = Math.min(t0, b0);
        t1 = Math.max(t1, b1);
        state.topDomain = [t0, t1];
    }

    // 2. Ensure detailDomain stays within topDomain and sync brushExtent
    if (state.detailDomain) {
        const [d0, d1] = state.detailDomain;
        const [t0, t1] = state.topDomain;
        const start = Math.max(d0, t0);
        const end = Math.min(d1, t1);
        if (start >= end) {
            state.detailDomain = [t0, t1];
        } else {
            state.detailDomain = [start, end];
        }
        // Sync brushExtent whenever detailDomain is explicit
        state.brushExtent = [...state.detailDomain];
    }
}
bus.on('stateChanged.validate', enforceConstraints);

// --- TOP CHART SETUP ---
const topC = d3.select('#topNumberline');
const xScale = d3.scaleLinear().domain(state.topDomain).range([0, 0]);
const xAxis = d3.axisBottom(xScale).ticks(15);
const topSvg = topC.append('svg');
const topG = topSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
const axisG = topG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);
const brushG = topG.append('g').attr('class', 'brush');

// brush behavior: real-time and end
const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]])
    .on('brush', event => {
        if (!event.sourceEvent) return;
        state.brushExtent = event.selection.map(xScale.invert);
        bus.call('stateChanged');
    })
    .on('end', event => {
        if (!event.sourceEvent) return;
        state.detailDomain = null;  // reset detail zoom on end
        bus.call('stateChanged');
    });

// top wheel-zoom updates state only
const TOP_SENS = 0.0005;
topSvg.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, topG.node());
    const mid = xScale.invert(mx);
    const factor = Math.exp(event.deltaY * TOP_SENS);

    const [d0, d1] = state.topDomain;
    state.topDomain = [mid + (d0 - mid) * factor, mid + (d1 - mid) * factor];
    bus.call('stateChanged');
});

// render top chart
function updateTop() {
    const width = topC.node().clientWidth - margin.left - margin.right;
    topSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    xScale.domain(state.topDomain).range([0, width]);
    axisG.call(xAxis);

    brush.extent([[0, 0], [width, innerH]]);
    brushG.call(brush);
    brushG.call(brush.move, state.brushExtent.map(xScale));
}

bus.on('stateChanged.updateTop', updateTop);

// --- DETAIL CHART SETUP ---
const dtC = d3.select('#decimalNumberline');
const dtSvg = dtC.append('svg');
const dtG = dtSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
const dtAxisG = dtG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

// render detail chart
function updateDetail() {
    const width = dtC.node().clientWidth - margin.left - margin.right;
    dtSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    const domain = state.detailDomain || state.brushExtent;
    const xD = d3.scaleLinear().domain(domain).range([0, width]);
    dtAxisG.call(d3.axisBottom(xD).ticks(15));
}

bus.on('stateChanged.updateDetail', updateDetail);

// detail wheel-zoom updates state only
const DET_SENS = 0.0005;
dtSvg.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, dtG.node());
    const width = dtC.node().clientWidth - margin.left - margin.right;
    const base = d3.scaleLinear()
        .domain(state.detailDomain || state.brushExtent)
        .range([0, width]);
    const mid = base.invert(mx);
    const factor = Math.exp(event.deltaY * DET_SENS);

    let [d0, d1] = base.domain();
    let n0 = mid + (d0 - mid) * factor;
    let n1 = mid + (d1 - mid) * factor;

    state.detailDomain = [n0, n1];
    bus.call('stateChanged');
});

// resize trigger
window.addEventListener('resize', () => bus.call('stateChanged'));

// initial render: validate then render
bus.call('stateChanged');
