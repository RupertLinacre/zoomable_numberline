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

// --- State for brush & detail zoom ---
let brushExtentDomain = [-10, 10];
let detailDomain = null;  // when null, falls back to brushExtentDomain

// --- Top chart setup ---
const topC = d3.select('#topNumberline');
const x = d3.scaleLinear().domain([-100, 100]).range([0, 0]);
const axis = d3.axisBottom(x);

const topSvg = topC.append('svg');
const topG = topSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
const axisG = topG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]])   // width set dynamically in updateTop
    .on('end', event => {
        if (!event.sourceEvent) return;   // ignore programmatic moves
        brushExtentDomain = event.selection.map(x.invert);
        detailDomain = null;               // reset detail zoom on new brush
        console.log('Brushed:', brushExtentDomain);
        updateDetail();
    });

const brushG = topG.append('g').attr('class', 'brush');

// --- draw/update top chart ---
function updateTop() {
    const width = topC.node().clientWidth - margin.left - margin.right;
    topSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    // update scale & axis
    x.range([0, width]);
    axisG.call(axis);
    console.log('Top axis domain:', x.domain());

    // update brush area & position
    brush.extent([[0, 0], [width, innerH]]);
    brushG.call(brush);
    brushG.call(brush.move, brushExtentDomain.map(x));
}

updateTop();
window.addEventListener('resize', () => {
    updateTop();
    updateDetail();
});

// --- Manual wheel-zoom on top chart ---
const TOP_SENSITIVITY = 0.0005;
topSvg.on('wheel', event => {
    event.preventDefault();
    const [mx] = d3.pointer(event, topG.node());
    const midVal = x.invert(mx);

    // factor: wheel-up (δY<0) → zoom in
    const factor = Math.exp(event.deltaY * TOP_SENSITIVITY);

    const [d0, d1] = x.domain();
    const new0 = midVal + (d0 - midVal) * factor;
    const new1 = midVal + (d1 - midVal) * factor;
    x.domain([new0, new1]);

    axisG.call(axis);
    brushG.call(brush.move, brushExtentDomain.map(x));

    console.log('Zoomed domain:', x.domain());
    console.log('Brush extent (domain):', brushExtentDomain);
});

// --- Detail chart setup ---
const dtC = d3.select('#decimalNumberline');
const dtSvg = dtC.append('svg');
const dtG = dtSvg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
const dtAxisG = dtG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

// --- draw/update detail chart ---
function updateDetail() {
    const w = dtC.node().clientWidth - margin.left - margin.right;
    dtSvg
        .attr('width', w + margin.left + margin.right)
        .attr('height', height);

    const domainToUse = detailDomain || brushExtentDomain;
    const xDetail = d3.scaleLinear()
        .domain(domainToUse)
        .range([0, w]);

    dtAxisG.call(d3.axisBottom(xDetail));
    console.log('Detail axis domain:', xDetail.domain());
}

updateDetail();

// --- Manual wheel-zoom on detail chart ---
const DETAIL_SENSITIVITY = 0.0005;
dtSvg.on('wheel', event => {
    event.preventDefault();

    const [mx] = d3.pointer(event, dtG.node());
    const w = dtC.node().clientWidth - margin.left - margin.right;
    const base = d3.scaleLinear()
        .domain(detailDomain || brushExtentDomain)
        .range([0, w]);
    const midVal = base.invert(mx);

    const factor = Math.exp(event.deltaY * DETAIL_SENSITIVITY);

    const [d0, d1] = base.domain();
    let new0 = midVal + (d0 - midVal) * factor;
    let new1 = midVal + (d1 - midVal) * factor;

    // clamp within brushExtentDomain
    const [b0, b1] = brushExtentDomain;
    new0 = Math.max(b0, Math.min(new0, b1));
    new1 = Math.max(b0, Math.min(new1, b1));

    detailDomain = [new0, new1];
    // also update brush on top
    brushExtentDomain = detailDomain;

    // re-render both
    updateTop();
    updateDetail();

    console.log('Detail zoomed domain:', detailDomain);
    console.log('Brush extent (domain):', brushExtentDomain);
});