// Sanity check
console.log("🛠 app loaded");
if (typeof d3 === 'undefined') {
    console.error("❌ D3 failed to load");
} else {
    console.log("✅ D3 v7 is ready:", d3.version);
}

// Shared margins & dims
const margin = { left: 40, right: 40, top: 20, bottom: 20 };
const height = 100;
const innerH = height - margin.top - margin.bottom;

// ----------
// Top chart + brush
// ----------
const topC = d3.select('#topNumberline');
let width;
let brushExtentDomain = [-10, 10];

const x = d3.scaleLinear().domain([-100, 100]).range([0, 0]);
const axis = d3.axisBottom(x);

const topSvg = topC.append('svg');
const topG = topSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
const axisG = topG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]])   // width set dynamically
    .on('end', event => {
        if (!event.sourceEvent) return;   // ignore programmatic moves
        brushExtentDomain = event.selection.map(x.invert);
        console.log('Brushed:', brushExtentDomain);
        updateDetail();
    });

const brushG = topG.append('g').attr('class', 'brush');

// draw the axis and brush
function updateTop() {
    width = topC.node().clientWidth - margin.left - margin.right;
    topSvg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    // 1) update scale & axis
    x.range([0, width]);
    axisG.call(axis);
    console.log('Top axis domain:', x.domain());

    // 2) update brush area & selection
    brush.extent([[0, 0], [width, innerH]]);
    brushG.call(brush);
    brushG.call(brush.move, brushExtentDomain.map(x));
}

// initial render + resize
updateTop();
window.addEventListener('resize', () => {
    updateTop();
    updateDetail();
});

// ----------
// Manual wheel-zoom for top chart
// ----------
const SENSITIVITY = 0.0005;

topSvg.on('wheel', event => {
    event.preventDefault();
    // pointer in data space
    const [mx] = d3.pointer(event, topG.node());
    const midVal = x.invert(mx);

    // smooth factor (~5% zoom per 100px scroll)
    const factor = Math.exp(event.deltaY * SENSITIVITY);

    // compute new domain around midVal
    const [d0, d1] = x.domain();
    const new0 = midVal + (d0 - midVal) * factor;
    const new1 = midVal + (d1 - midVal) * factor;
    x.domain([new0, new1]);

    // redraw axis + reposition brush
    axisG.call(axis);
    brushG.call(brush.move, brushExtentDomain.map(x));

    console.log('Zoomed domain:', x.domain());
    console.log('Brush extent (domain):', brushExtentDomain);
});

// ------------
// Detail chart (static from brush only)
// ------------
const dtC = d3.select('#decimalNumberline');
const dtSvg = dtC.append('svg');
const dtG = dtSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
const dtAxisG = dtG.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

function updateDetail() {
    const detailWidth = dtC.node().clientWidth - margin.left - margin.right;
    dtSvg
        .attr('width', detailWidth + margin.left + margin.right)
        .attr('height', height);

    const xDetail = d3.scaleLinear()
        .domain(brushExtentDomain)
        .range([0, detailWidth]);

    const axisDetail = d3.axisBottom(xDetail);
    dtAxisG.call(axisDetail);

    console.log('Detail axis domain:', xDetail.domain());
}

// initial detail render
updateDetail();