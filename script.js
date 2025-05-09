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

// brush behavior
const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]])
    .on('end', event => {
        if (!event.sourceEvent) return;
        state.brushExtent = event.selection.map(xScale.invert);
        state.detailDomain = null;  // reset detail zoom
        console.log('Brushed:', state.brushExtent);
        bus.call('stateChanged');
    });

// wheel-zoom on top
const TOP_SENS = 0.0005;
topSvg.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, topG.node());
    const mid = xScale.invert(mx);
    const factor = Math.exp(event.deltaY * TOP_SENS);

    const [d0, d1] = state.topDomain;
    const n0 = mid + (d0 - mid) * factor;
    const n1 = mid + (d1 - mid) * factor;

    state.topDomain = [n0, n1];
    console.log('Zoomed domain:', state.topDomain,
        'Brush extent:', state.brushExtent);
    bus.call('stateChanged');
});

// draw/top update
function updateTop() {
    const width = topC.node().clientWidth - margin.left - margin.right;
    topSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    xScale.domain(state.topDomain).range([0, width]);
    axisG.call(xAxis);
    console.log('Top axis domain:', state.topDomain);

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

// draw/detail update
function updateDetail() {
    const width = dtC.node().clientWidth - margin.left - margin.right;
    dtSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    const domain = state.detailDomain || state.brushExtent;
    const xD = d3.scaleLinear().domain(domain).range([0, width]);
    dtAxisG.call(d3.axisBottom(xD).ticks(15));

    console.log('Detail axis domain:', domain);
}
bus.on('stateChanged.updateDetail', updateDetail);

// wheel-zoom on detail
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

    let [currentDetailD0, currentDetailD1] = base.domain();
    // Calculate the new potential domain based on zoom factor and mouse position
    let newZoomedD0 = mid + (currentDetailD0 - mid) * factor;
    let newZoomedD1 = mid + (currentDetailD1 - mid) * factor;

    const [topDomainStart, topDomainEnd] = state.topDomain;

    // Clamp the new zoomed detail domain to be an inclusive subset of state.topDomain
    let finalDetailD0 = Math.max(topDomainStart, newZoomedD0);
    let finalDetailD1 = Math.min(topDomainEnd, newZoomedD1);

    // Ensure the domain remains valid (start < end).
    // If clamping causes the domain to collapse or invert (e.g., finalDetailD0 >= finalDetailD1),
    // it means the zoom operation tried to go beyond the topDomain's bounds
    // or the topDomain itself is too small to allow further distinct zooming out from that point.
    // In such a case, set the detailDomain to the full extent of topDomain,
    // representing the maximum possible zoom-out within the constraint.
    if (finalDetailD0 >= finalDetailD1) {
        state.detailDomain = [topDomainStart, topDomainEnd];
    } else {
        state.detailDomain = [finalDetailD0, finalDetailD1];
    }

    // Sync state.brushExtent with the NEW state.detailDomain
    state.brushExtent = [...state.detailDomain];

    console.log('Detail zoomed. New detailDomain:', state.detailDomain);
    console.log('Brush extent (NOW SYNCED with detailDomain):', state.brushExtent);
    bus.call('stateChanged');
});

// --- RESIZE HANDLING ---
window.addEventListener('resize', () => bus.call('stateChanged'));

// --- INITIAL RENDER ---
bus.call('stateChanged');