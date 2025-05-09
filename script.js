// Sanity check
console.log("🛠 app loaded");
if (typeof d3 === 'undefined') {
    console.error("❌ D3 failed to load");
} else {
    console.log("✅ D3 v7 is ready:", d3.version);
}

// Step 2/3 setup
const container = d3.select('#topNumberline');
const margin = { left: 40, right: 40, top: 20, bottom: 20 };
const height = 100;
const innerH = height - margin.top - margin.bottom;

let width;
const x = d3.scaleLinear().domain([-100, 100]).range([0, 0]);
const axis = d3.axisBottom(x);

const svg = container.append('svg');
const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

const axisG = g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`);

const brush = d3.brushX()
    .extent([[0, 0], [0, innerH]])   // width set in update()
    .on('end', event => {
        if (!event.sourceEvent) return;
        brushExtentDomain = event.selection.map(x.invert);
        console.log("Brushed:", brushExtentDomain);
    });

let brushG = g.append('g').attr('class', 'brush');

// track the brush‐extent in data units
let brushExtentDomain = [-10, 10];

// updateTop: draw axis & brush, log domain
function updateTop() {
    width = container.node().clientWidth - margin.left - margin.right;
    svg
        .attr('width', width + margin.left + margin.right)
        .attr('height', height);

    // 1) scale & axis
    x.range([0, width]);
    axisG.call(axis);
    console.log("Top axis domain:", x.domain());

    // 2) brush area
    brush.extent([[0, 0], [width, innerH]]);
    brushG.call(brush);
    // position the selection based on brushExtentDomain
    brushG.call(brush.move, brushExtentDomain.map(x));
}

// -------------
// Step 4+: manual wheel‐zoom with sensitivity tweak
// -------------
const SENSITIVITY = 0.0005;

svg.on('wheel', event => {
    event.preventDefault();
    // data-space mouse x
    const [mx] = d3.pointer(event, g.node());
    const midVal = x.invert(mx);

    // smoother factor: ~5% per 100px scroll
    const factor = Math.exp(-event.deltaY * SENSITIVITY);

    // compute new domain around pointer
    const [d0, d1] = x.domain();
    const new0 = midVal + (d0 - midVal) * factor;
    const new1 = midVal + (d1 - midVal) * factor;
    x.domain([new0, new1]);

    // redraw axis & move brush
    axisG.call(axis);
    brushG.call(brush.move, brushExtentDomain.map(x));

    // log
    console.log("Zoomed domain:", x.domain());
    console.log("Brush extent (domain):", brushExtentDomain);
});

// initial render + resize hook
updateTop();
window.addEventListener('resize', updateTop);